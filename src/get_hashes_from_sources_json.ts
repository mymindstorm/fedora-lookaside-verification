import { appendFile, readFile, writeFile } from "fs/promises";
import { createHash } from "crypto";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { Client } from "basic-ftp";

const SpecNameRegex = /(.+)\.spec$/;

export default async function getHashesFromSourcesJSON(
  path: string,
  output: string,
) {
  await writeFile(output, "Source Package,Protocol,URL,SHA256,Error\n", {
    flag: "w",
  });

  const sourcesJSON: Record<string, { error?: string; sources: string[] }> =
    JSON.parse((await readFile(path)).toString());

  for (const spec in sourcesJSON) {
    // Get source package name
    const specNameMatches = spec.match(SpecNameRegex);
    if (specNameMatches === null) {
      console.warn(`${spec} unable to be split into source package name!`);
      continue;
    }
    const specName = specNameMatches[1];

    // Get hash of files in sources
    for (const rawURL of sourcesJSON[spec].sources) {
      try {
        const url = new URL(rawURL);

        try {
          console.log(rawURL);
          const sha256 = createHash("sha256");

          if (url.protocol === "http:" || url.protocol === "https:") {
            const res = await fetch(url);
            const resBody = res.body;
            if (!res.ok) {
              throw new Error("Response bad status code");
            }

            if (resBody === null) {
              throw new Error("Response body null!");
            }

            // WEIRDNESS: If you do this in one line (like in get_sources_json_from_specs.ts), node just exits without any errors
            const resStream = Readable.fromWeb(resBody);
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
            `${specName},${url.protocol},${rawURL},,${e}\n`,
          );
        }
      } catch {
        // no-op. we don't process anything with an invalid url
      }
    }
  }

  return;
}
