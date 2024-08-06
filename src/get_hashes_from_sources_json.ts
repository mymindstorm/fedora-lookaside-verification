import { appendFile, readFile, writeFile } from "fs/promises";
import { createHash } from "crypto";
import { finished } from "node:stream/promises";
import { Client } from "basic-ftp";
import cliProgress from "cli-progress";
import axios from "axios";
import https from "node:https";

const SpecNameRegex = /(.+)\.spec$/;
const agent = new https.Agent({
  rejectUnauthorized: false,
});

export default async function getHashesFromSourcesJSON(
  path: string,
  output: string,
  opts?: { startFrom?: string; retryPackages?: string },
) {
  if (!opts?.startFrom) {
    await writeFile(output, "Source Package,Protocol,URL,SHA256,Error\n", {
      flag: "w",
    });
  }

  let retryPkgs: string[] = [];
  if (opts?.retryPackages) {
    const retryContent = await readFile(opts.retryPackages);
    retryPkgs = retryContent.toString().split("\n");
  }

  const sourcesJSON: Record<string, { error?: string; sources: string[] }> =
    JSON.parse((await readFile(path)).toString());

  console.log("Retrieving source files...");
  const progress = new cliProgress.MultiBar(
    {
      format: " {bar} | {filename} | {value}/{total}",
    },
    cliProgress.Presets.shades_classic,
  );
  const mainBar = progress.create(Object.keys(sourcesJSON).length, 0);
  const subBar = progress.create(0, 0);

  let readyToProcess = !opts?.startFrom;
  for (const spec in sourcesJSON) {
    // Get source package name
    const specNameMatches = spec.match(SpecNameRegex);
    if (specNameMatches === null) {
      console.error(`${spec} unable to be split into source package name!`);
      continue;
    }
    const specName = specNameMatches[1];
    mainBar.increment(1, { filename: specName });
    subBar.setTotal(sourcesJSON[spec].sources.length);
    subBar.update(0);

    if (retryPkgs.length !== 0 && !retryPkgs.includes(specName)) {
      continue;
    }

    if (specName === opts?.startFrom) {
      readyToProcess = true;
    }
    if (!readyToProcess) {
      continue;
    }

    // Get hash of files in sources
    for (const rawURL of sourcesJSON[spec].sources) {
      try {
        const url = new URL(rawURL);
        const pathSplit = url.pathname.split("/");
        const fileName = pathSplit[pathSplit.length - 1];
        subBar.increment(1, { filename: fileName });

        try {
          const sha256 = createHash("sha256");

          if (url.protocol === "http:" || url.protocol === "https:") {
            const res = await axios.get(url.href, {
              responseType: "stream",
              httpsAgent: agent,
            });

            // WEIRDNESS: If you do this in one line (like in get_sources_json_from_specs.ts), node just exits without any errors
            const resStream = res.data;
            resStream.pipe(sha256);
            await finished(resStream);
          } else if (url.protocol === "ftp:") {
            const client = new Client();
            await client.access({
              host: url.host,
            });
            await client.downloadTo(sha256, url.pathname);
          } else {
            throw new Error("Unsupported protocol.");
          }
          await appendFile(
            output,
            `${specName},${url.protocol},${rawURL},${sha256.digest("hex")},\n`,
          );
        } catch (e) {
          await appendFile(
            output,
            `${specName},${url.protocol},${rawURL},,${e}`.replaceAll("\n", "") +
              "\n",
          );
        }
      } catch {
        subBar.increment(1);
      }
    }

    subBar.stop();
  }

  mainBar.stop();
  progress.stop();
  return;
}
