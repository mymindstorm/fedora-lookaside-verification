import { version, name } from "../package.json";
import { Command } from "commander";
import getSourcesJSONFromSpecs from "./get_sources_json_from_specs";
import getHashesFromSourcesJSON from "./get_hashes_from_sources_json";

const program = new Command();
program.name(name);
program.version(version);

program
  .command("sources-from-specs")
  .description("Get the source URLs from spec files on the lookaside cache.")
  .argument(
    "[url-to-specs]",
    "URL to .tar.xz containing spec files",
    "https://src.fedoraproject.org/repo/rpm-specs-latest.tar.xz",
  )
  .option(
    "-o, --output-json <path>",
    "Path to output sources JSON. Existing files will be overwritten, missing directories must exist or it will error out at the end.",
    "sources-from-specs.json",
  )
  .action(async (url: string, options: { outputJson: string }) => {
    await getSourcesJSONFromSpecs(url, options.outputJson);
  });

program
  .command("hash-from-sources")
  .description(
    "Get the hash of every remote file in referenced in the output of sources-from-specs's JSON file. Invalid URLs are ignored. http://, https://, and ftp:// are supported.",
  )
  .argument("<path-to-json>", "Path to output of sources-from-specs")
  .option(
    "-o, --output-csv <path>",
    "Path to output CSV. Existing files will be overwritten, missing directories must exist or it will error out.",
    "hashes.csv",
  )
  .option(
    "-s, --start-from <name>",
    "Start from a specific source package. Operates in append-only mode.",
  )
  .action(
    async (
      path: string,
      options: { outputCsv: string; startFrom?: string },
    ) => {
      await getHashesFromSourcesJSON(path, options.outputCsv, options);
    },
  );

program.parse(process.argv);
