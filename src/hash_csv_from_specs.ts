import ora from "ora";
import tmp from "tmp-promise";
import tar from "tar-fs";
import { finished } from "node:stream/promises";
import { Readable } from "node:stream";
import * as lzma from "lzma-native";

tmp.setGracefulCleanup();

export default async function genHashCSVFromSpecs(
  specsURL: string,
  outputPath: string,
) {
  const tmpDir = await tmp.dir({
    unsafeCleanup: false, // TODO: make this true
    prefix: "fedora-lookaside-verification-",
  });

  const loadingSpinner = ora("Downloading and extracting spec files").start();
  const logInfo = (text: string) => {
    loadingSpinner.clear();
    loadingSpinner.frame();
    console.log(text);
  };

  // REMOVE
  logInfo(outputPath);

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
      .pipe(tar.extract(tmpDir.path)),
  );
  logInfo(`Extracted spec files to ${tmpDir.path}`);
  loadingSpinner.succeed("Downloaded and extracted spec files");
}
