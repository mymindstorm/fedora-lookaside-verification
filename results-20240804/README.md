This data was generated via running the scripts in this repository against https://src.fedoraproject.org/repo/rpm-specs-20240804.tar.xz.
Results may be non-deterministic. `spectool` relies your local system having the correct macro definitions.

| File | Description |
| ---- | ----------- |
| `rpm-specs-20240804.tar.xz` | Collection of `.spec` files used to generate this data. |
| `sources-from-specs-original.json` | List of source URLs by spec file, generated using `rpm-specs-20240804.tar.xz`. |
| `sources-from-specs-corrected.json` | Manual correction of `sources-from-specs-original.json` to fix `download.kde.org` URLs. |
| `hashes-original.csv` | Hashes of remote files listed in `sources-from-specs-original.json` |
| `hashes-missing-kde.csv` | Hashes of download.kde.org/* remote files from `sources-from-specs-corrected.json` |
| `hashes-retry.csv` | Re-run of `hashes-original.csv`  over just source packages which may have errored out due to flakiness. |
| `hashes.csv` | Merge of `hashes-*.csv`. If the same record has two different hashes, both are included and a warning is added to the record. |
| `lookaside-hashes.csv` | Hashes of Fedora's cached copy of remote files listed in `sources-from-specs-original.json` |
| `results.csv` | Merge of `hashes.csv` and `lookaside-hashes.csv` and an extra column comparing hashes. |

Manually corrected a few which spectool could not render without other resources

TODO: something is up w/ crates.io packages
TODO: pick winners from hashes-*.csv, then merge all csvs into one file and compare
TODO: warn if more than one version of a file
