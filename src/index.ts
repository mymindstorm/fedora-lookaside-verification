import { version, name } from "../package.json";
import { Command } from "commander";
import genHashCSVFromSpecs from "./hash_csv_from_specs";

const program = new Command();
program.name(name);
program.version(version);

program
  .command("hash-from-specs")
  .description(
    "Get the hashes of every source declared in spec files on the lookaside cache.",
  )
  .argument(
    "[url-to-specs]",
    "URL to .tar.xz containing spec files",
    "https://src.fedoraproject.org/repo/rpm-specs-latest.tar.xz",
  )
  .option(
    "-o, --output-csv <path>",
    "Path to output csv. Existing files will be overwritten, missing directories will be created.",
    "out/hashes-from-specs.csv",
  )
  .action(async (url: string, options: { outputCsv: string }) => {
    await genHashCSVFromSpecs(url, options.outputCsv);
  });

program.parse(process.argv);
