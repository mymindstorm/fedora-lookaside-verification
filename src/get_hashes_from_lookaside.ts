import { appendFile, readFile, writeFile } from "fs/promises";
import { createHash } from "crypto";
import { finished } from "node:stream/promises";
import cliProgress from "cli-progress";
import axios from "axios";
// @ts-expect-error no typings
import parse from "parse-apache-directory-index";

const SpecNameRegex = /(.+)\.spec$/;
const HrefRegex = /^.+<a href="(.+)">.+<\/a>.+$/gm;

export default async function getHashesFromLookaside(
  path: string,
  output: string,
) {
  await writeFile(output, "Source Package,URL,SHA256,Error\n", {
    flag: "w",
  });

  const sourcesJSON: Record<string, { error?: string; sources: string[] }> =
    JSON.parse((await readFile(path)).toString());

  console.log("Retrieving lookaside cahce files...");
  const progress = new cliProgress.MultiBar(
    {
      format: " {bar} | {filename} | {value}/{total}",
    },
    cliProgress.Presets.shades_classic,
  );
  const mainBar = progress.create(Object.keys(sourcesJSON).length, 0);
  const subBar = progress.create(0, 0);

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

    for (const rawURL of sourcesJSON[spec].sources) {
      try {
        new URL(rawURL);
        const pathSplit = rawURL.split("/");
        const fileName = pathSplit[pathSplit.length - 1];
        subBar.increment(1, { filename: fileName });

        try {
          // Don't ask...
          let topLevel = true;
          const fileUrls: string[] = [];
          const scanUrls: string[] = [
            `https://src.fedoraproject.org/repo/pkgs/${specName}/${fileName}/`,
          ];
          while (scanUrls.length) {
            const scanUrl = scanUrls.pop();
            if (!scanUrl) {
              console.error(
                "scan url undefined for " + specName + " file " + fileName,
              );
              continue;
            }

            const res = await axios.get(scanUrl, { responseType: "text" });
            const dirIndex = parse(res.data);

            for (const file of dirIndex.files) {
              if (
                file.type === "directory" &&
                (file.name.startsWith("sha") ||
                  file.name === "md5/" ||
                  !topLevel)
              ) {
                scanUrls.push(`https://src.fedoraproject.org${file.path}`);
                topLevel = false;
              } else if (file.type === "file") {
                fileUrls.push(`https://src.fedoraproject.org${file.path}`);
              }
            }
          }

          if (!fileUrls.length) {
            throw new Error("Could not find file URL(s) in lookaside cache!");
          }

          while (fileUrls.length) {
            const sha256 = createHash("sha256");
            const fileUrl = fileUrls.pop();
            if (!fileUrl) {
              console.error(
                "file url undefined for " + specName + " file " + fileName,
              );
              continue;
            }

            const res = await axios.get(fileUrl, { responseType: "stream" });
            // WEIRDNESS: If you do this in one line (like in get_sources_json_from_specs.ts), node just exits without any errors
            const resStream = res.data;
            resStream.pipe(sha256);
            await finished(resStream);

            await appendFile(
              output,
              `${specName},${fileUrl},${sha256.digest("hex")},\n`,
            );
          }
        } catch (e) {
          await appendFile(
            output,
            `${specName},https://src.fedoraproject.org/repo/pkgs/${specName}/${fileName}/,,${e}`.replaceAll(
              "\n",
              "",
            ) + "\n",
          );
        }
      } catch {
        subBar.increment(1);
      }
    }
  }

  subBar.stop();
  mainBar.stop();
  progress.stop();
}
