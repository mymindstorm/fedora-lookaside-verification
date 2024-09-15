import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import https from "node:https";
import { join } from "node:path";
import { execFile as oldExecFile } from "node:child_process";
import { promisify } from "node:util";
import { parse } from "csv-parse";
import tmp from "tmp-promise";
import ora from "ora";
import axios from "axios";
import { finished } from "node:stream/promises";
import { Client } from "basic-ftp";
import decompress from "decompress";
import { rimraf } from "rimraf";

const execFile = promisify(oldExecFile);
const agent = new https.Agent({
  rejectUnauthorized: false,
});

export default async function genDiff(path: string, output: string) {
  const rawInput = await readFile(path);
  const input = await parse(rawInput).toArray();
  input.shift();

  const tmpDir = await tmp.dir({
    unsafeCleanup: false,
    prefix: "fedora-lookaside-verification-",
  });

  const spinner = ora("").start();

  for (const [i, entry] of input.entries()) {
    const sourcePackage = entry[0];
    const fileName = entry[4];
    const lookasideURL = entry[1];
    const sourceURL = entry[6];

    let comparisonReport = `Source package : ${sourcePackage}
File name       : ${fileName}
Lookaside URL   : ${lookasideURL}
Source URL      : ${sourceURL}\n\n`;

    spinner.text = `Comparing files: ${sourcePackage} ${fileName} (${i}/${input.length})`;
    if (!existsSync(output)) {
      await mkdir(output);
    }

    const urls = [
      {
        type: "source",
        url: sourceURL,
        extractPath: join(tmpDir.path, `source-${fileName}-extracted`),
        tmpFilePath: join(tmpDir.path, `source-${fileName}`),
      },
      {
        type: "lookaside",
        url: lookasideURL,
        extractPath: join(tmpDir.path, `lookaside-${fileName}-extracted`),
        tmpFilePath: join(tmpDir.path, `lookaside-${fileName}`),
      },
    ];

    // Download and extract both files
    for (const urlInfo of urls) {
      const url = new URL(urlInfo.url);
      const writeStream = createWriteStream(urlInfo.tmpFilePath);

      // download file
      if (url.protocol === "http:" || url.protocol === "https:") {
        const res = await axios.get(url.href, {
          responseType: "stream",
          httpsAgent: agent,
          headers: {
            Accept: "application/octet-stream,*/*",
          },
        });

        res.data.pipe(writeStream);
        await finished(res.data);
      } else if (url.protocol === "ftp:") {
        const client = new Client();
        await client.access({
          host: url.host,
        });
        await client.downloadTo(writeStream, url.pathname);
      } else {
        throw new Error("Unsupported protocol.");
      }

      // get file type
      const file = await execFile("file", [urlInfo.tmpFilePath]);
      comparisonReport += `${urlInfo.type} file type: ${file.stdout}\n`;

      // extract file
      await mkdir(urlInfo.extractPath);
      await decompress(urlInfo.tmpFilePath, urlInfo.extractPath);
    }

    try {
      await execFile("diff", ["-r", urls[0].extractPath, urls[1].extractPath]);

      comparisonReport += `\n\nNo differences detected!`;
    } catch (e) {
      const output = e as { stdout: string; stderr: string };
      comparisonReport += `\n\n${output.stdout + output.stderr}`;
    }

    await rimraf([
      urls[0].extractPath,
      urls[1].extractPath,
      urls[0].tmpFilePath,
      urls[1].tmpFilePath,
    ]);

    await writeFile(
      join(output, `${sourcePackage}-${fileName}.diff`),
      comparisonReport,
    );
  }

  spinner.succeed(`Compared ${input.length} files`);
  console.log(`Results saved to ${output}`);

  await tmpDir.cleanup();
  return;
}
