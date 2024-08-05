import ora from "ora";
import tmp from "tmp-promise";
import tar from "tar-fs";
import { readdir, writeFile } from "node:fs/promises";
import { finished } from "node:stream/promises";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { execFile as oldExecFile } from "node:child_process";
import * as lzma from "lzma-native";
import cliProgress from "cli-progress";

const execFile = promisify(oldExecFile);

tmp.setGracefulCleanup();

const SpectoolURLRegex = /^.+: (.+)$/gm;

export default async function getSourcesJSONFromSpecs(
  specsURL: string,
  outputPath: string,
) {
  const tmpDir = await tmp.dir({
    unsafeCleanup: true,
    prefix: "fedora-lookaside-verification-",
  });

  const loadingSpinner = ora("Downloading and extracting spec files").start();
  const log = (text: string, warn = false) => {
    loadingSpinner.clear();
    loadingSpinner.frame();
    if (warn) {
      console.warn(text);
    } else {
      console.debug(text);
    }
  };

  // Download and extract spec .tar.xz file
  const specFileRes = await fetch(specsURL);
  const specFileResBody = specFileRes.body;
  if (specFileResBody === null) {
    loadingSpinner.fail("Spec file .tar.xz response from web server was null!");
    return;
  }

  await finished(
    Readable.fromWeb(specFileResBody)
      .pipe(lzma.createDecompressor())
      .pipe(tar.extract(`${tmpDir.path}/specs-tar/`)),
  );
  log(`Extracted spec files to ${tmpDir.path}`);
  loadingSpinner.succeed("Downloaded and extracted spec files");

  // Get urls using spectool
  const records: Record<string, { error?: string; sources: string[] }> = {};
  const files = await readdir(`${tmpDir.path}/specs-tar/rpm-specs/`);
  const progress = new cliProgress.SingleBar(
    {},
    cliProgress.Presets.shades_classic,
  );
  progress.start(files.length, 1);
  for (const file of files) {
    try {
      const spectool = await execFile("spectool", ["-l", file], {
        cwd: `${tmpDir.path}/specs-tar/rpm-specs/`,
      });

      const sources = [];

      for (const match of spectool.stdout.matchAll(SpectoolURLRegex)) {
        sources.push(match[1]);
      }

      records[file] = {
        error: spectool.stderr === "" ? undefined : spectool.stderr,
        sources,
      };
    } catch (e: unknown) {
      if (
        e &&
        typeof e === "object" &&
        "stderr" in e &&
        e.stderr &&
        typeof e.stderr === "string"
      ) {
        records[file] = {
          error: e.stderr,
          sources: [],
        };
      } else if (e instanceof Error) {
        records[file] = {
          error: e.message,
          sources: [],
        };
      } else {
        records[file] = {
          error: "An unknown error occured!",
          sources: [],
        };
      }
    }

    progress.increment(1);
  }

  await writeFile(outputPath, JSON.stringify(records, null, 2), { flag: "w" });
}
