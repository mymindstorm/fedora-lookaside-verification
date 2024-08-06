import { appendFile, readFile, writeFile } from "fs/promises";
import { createHash } from "crypto";
import { finished } from "node:stream/promises";
import cliProgress from "cli-progress";
import axios from "axios";

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
          const sha256 = createHash("sha256");

          // Don't ask...
          let fileUrl = "";
          let nextUrl = `https://src.fedoraproject.org/repo/pkgs/${specName}/${fileName}/`;
          while (!fileUrl) {
            let foundMatch = false;
            const res = await axios.get(nextUrl, { responseType: "text" });
            const rootDirMatches = (res.data as string).matchAll(HrefRegex);
            for (const match of rootDirMatches) {
              const matchStr = match[1];
              if (!matchStr.startsWith("/") && !matchStr.startsWith("?")) {
                if (matchStr.endsWith("/")) {
                  nextUrl += matchStr;
                } else {
                  fileUrl = nextUrl + matchStr;
                }

                foundMatch = true;
              }
            }

            if (!foundMatch) {
              throw new Error("Could not traverse lookaside cache!");
            }
          }

          if (!fileUrl) {
            throw new Error("Could not find file URL in lookaside cache!");
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
