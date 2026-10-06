# 1. FluidSynth/fluidsynth#1639, rerun-v0.1.1-2026-10-06: pass

- Pull request: https://github.com/FluidSynth/fluidsynth/pull/1639
- Agent: A (GitHub Copilot coding agent), selected by `demo/2026-10/selection-rule.md`; 2510 stars and a 1209-character cleaned body at selection.
- Head: `8a2f22f0209c3a88b513e82d4e9040d754d9646d`
- Block: `../block.json`, made from the PR body and the PR by `demo/2026-10/procedure.md`. It is not the agent's own block: the agent wrote prose.
- Report: the PR body, then the block as a `dunstan-handback` fence (Rule 10); sha256 `6d3e6ec575da7cdc4e57046bf3ff490004ff7e8a841f446301a25f29885c8023`. The report file is git-ignored; `select.mjs pr 1` and `check.mjs 1` rebuild it.
- Checker: dunstan 0.1.1, `dist/dunstan.mjs` sha256 `9bbd685b8adbb1cf11beaad7dc294150e30775f50c3c3a2468f596deca7f38e4`

## Verdict: `pass`

66 claims: 66 pass.

| Verdict | Claim | Declared | Observed | Reason |
|---|---|---|---|---|
| pass | `head:/headCommit` | `8a2f22f0209c3a88b513e82d4e9040d754d9646d` | `8a2f22f0209c3a88b513e82d4e9040d754d9646d` |  |
| pass | `scope:/filesChanged/0` | `.azure/azure-pipelines-alpine.yml` | `.azure/azure-pipelines-alpine.yml` |  |
| pass | `scope:/filesChanged/1` | `.azure/azure-pipelines-android.yml` | `.azure/azure-pipelines-android.yml` |  |
| pass | `scope:/filesChanged/2` | `.azure/azure-pipelines-mac.yml` | `.azure/azure-pipelines-mac.yml` |  |
| pass | `scope:/filesChanged/3` | `.azure/cmake-android.yml` | `.azure/cmake-android.yml` |  |
| pass | `scope:/filesChanged/4` | `.github/workflows/api_doc_build.yml` | `.github/workflows/api_doc_build.yml` |  |
| pass | `scope:/filesChanged/5` | `.github/workflows/freebsd.yml` | `.github/workflows/freebsd.yml` |  |
| pass | `scope:/filesChanged/6` | `.github/workflows/ios.yml` | `.github/workflows/ios.yml` |  |
| pass | `scope:/filesChanged/7` | `.github/workflows/linux.yml` | `.github/workflows/linux.yml` |  |
| pass | `scope:/filesChanged/8` | `.github/workflows/os2.yml` | `.github/workflows/os2.yml` |  |
| pass | `scope:/filesChanged/9` | `.github/workflows/rendering-regression.yml` | `.github/workflows/rendering-regression.yml` |  |
| pass | `scope:/filesChanged/10` | `.github/workflows/solaris.yml` | `.github/workflows/solaris.yml` |  |
| pass | `scope:/filesChanged/11` | `.github/workflows/sonarcloud.yml` | `.github/workflows/sonarcloud.yml` |  |
| pass | `scope:/filesChanged/12` | `.github/workflows/windows.yml` | `.github/workflows/windows.yml` |  |
| pass | `scope:/filesChanged/13` | `CMakeLists.txt` | `CMakeLists.txt` |  |
| pass | `scope:/filesChanged/14` | `cmake_admin/FluidUnitTest.cmake` | `cmake_admin/FluidUnitTest.cmake` |  |
| pass | `scope:/filesChanged/15` | `test-android/.gitignore` | `test-android/.gitignore` |  |
| pass | `scope:/filesChanged/16` | `test-android/README.md` | `test-android/README.md` |  |
| pass | `scope:/filesChanged/17` | `test-android/app/.gitignore` | `test-android/app/.gitignore` |  |
| pass | `scope:/filesChanged/18` | `test-android/app/build.gradle` | `test-android/app/build.gradle` |  |
| pass | `scope:/filesChanged/19` | `test-android/app/proguard-rules.pro` | `test-android/app/proguard-rules.pro` |  |
| pass | `scope:/filesChanged/20` | `test-android/app/src/androidTest/java/org/fluidsynth/fluidsynth_tests/ExampleInstrumentedTest.kt` | `test-android/app/src/androidTest/java/org/fluidsynth/fluidsynth_tests/ExampleInstrumentedTest.kt` |  |
| pass | `scope:/filesChanged/21` | `test-android/app/src/main/AndroidManifest.xml` | `test-android/app/src/main/AndroidManifest.xml` |  |
| pass | `scope:/filesChanged/22` | `test-android/app/src/main/cpp/CMakeLists.txt` | `test-android/app/src/main/cpp/CMakeLists.txt` |  |
| pass | `scope:/filesChanged/23` | `test-android/app/src/main/cpp/native-lib.cpp` | `test-android/app/src/main/cpp/native-lib.cpp` |  |
| pass | `scope:/filesChanged/24` | `test-android/app/src/main/java/org/fluidsynth/fluidsynthtests/MainActivity.kt` | `test-android/app/src/main/java/org/fluidsynth/fluidsynthtests/MainActivity.kt` |  |
| pass | `scope:/filesChanged/25` | `test-android/app/src/main/java/org/fluidsynth/fluidsynthtests/TestRunner.kt` | `test-android/app/src/main/java/org/fluidsynth/fluidsynthtests/TestRunner.kt` |  |
| pass | `scope:/filesChanged/26` | `test-android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml` | `test-android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml` |  |
| pass | `scope:/filesChanged/27` | `test-android/app/src/main/res/drawable/ic_launcher_background.xml` | `test-android/app/src/main/res/drawable/ic_launcher_background.xml` |  |
| pass | `scope:/filesChanged/28` | `test-android/app/src/main/res/layout/activity_main.xml` | `test-android/app/src/main/res/layout/activity_main.xml` |  |
| pass | `scope:/filesChanged/29` | `test-android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` | `test-android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` |  |
| pass | `scope:/filesChanged/30` | `test-android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml` | `test-android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml` |  |
| pass | `scope:/filesChanged/31` | `test-android/app/src/main/res/mipmap-hdpi/ic_launcher.png` | `test-android/app/src/main/res/mipmap-hdpi/ic_launcher.png` |  |
| pass | `scope:/filesChanged/32` | `test-android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png` | `test-android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png` |  |
| pass | `scope:/filesChanged/33` | `test-android/app/src/main/res/mipmap-mdpi/ic_launcher.png` | `test-android/app/src/main/res/mipmap-mdpi/ic_launcher.png` |  |
| pass | `scope:/filesChanged/34` | `test-android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png` | `test-android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png` |  |
| pass | `scope:/filesChanged/35` | `test-android/app/src/main/res/mipmap-xhdpi/ic_launcher.png` | `test-android/app/src/main/res/mipmap-xhdpi/ic_launcher.png` |  |
| pass | `scope:/filesChanged/36` | `test-android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png` | `test-android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png` |  |
| pass | `scope:/filesChanged/37` | `test-android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png` | `test-android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png` |  |
| pass | `scope:/filesChanged/38` | `test-android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png` | `test-android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png` |  |
| pass | `scope:/filesChanged/39` | `test-android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` | `test-android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` |  |
| pass | `scope:/filesChanged/40` | `test-android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png` | `test-android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png` |  |
| pass | `scope:/filesChanged/41` | `test-android/app/src/main/res/values-night/themes.xml` | `test-android/app/src/main/res/values-night/themes.xml` |  |
| pass | `scope:/filesChanged/42` | `test-android/app/src/main/res/values/colors.xml` | `test-android/app/src/main/res/values/colors.xml` |  |
| pass | `scope:/filesChanged/43` | `test-android/app/src/main/res/values/strings.xml` | `test-android/app/src/main/res/values/strings.xml` |  |
| pass | `scope:/filesChanged/44` | `test-android/app/src/main/res/values/themes.xml` | `test-android/app/src/main/res/values/themes.xml` |  |
| pass | `scope:/filesChanged/45` | `test-android/app/src/test/java/org/fluidsynth/fluidsynth_tests/ExampleUnitTest.kt` | `test-android/app/src/test/java/org/fluidsynth/fluidsynth_tests/ExampleUnitTest.kt` |  |
| pass | `scope:/filesChanged/46` | `test-android/build-scripts/.gitignore` | `test-android/build-scripts/.gitignore` |  |
| pass | `scope:/filesChanged/47` | `test-android/build-scripts/build-all-archs.sh` | `test-android/build-scripts/build-all-archs.sh` |  |
| pass | `scope:/filesChanged/48` | `test-android/build-scripts/build-call-cmake.sh` | `test-android/build-scripts/build-call-cmake.sh` |  |
| pass | `scope:/filesChanged/49` | `test-android/build-scripts/build-env.sh` | `test-android/build-scripts/build-env.sh` |  |
| pass | `scope:/filesChanged/50` | `test-android/build-scripts/build.sh` | `test-android/build-scripts/build.sh` |  |
| pass | `scope:/filesChanged/51` | `test-android/build-scripts/download.sh` | `test-android/build-scripts/download.sh` |  |
| pass | `scope:/filesChanged/52` | `test-android/build-scripts/extract.sh` | `test-android/build-scripts/extract.sh` |  |
| pass | `scope:/filesChanged/53` | `test-android/build.gradle` | `test-android/build.gradle` |  |
| pass | `scope:/filesChanged/54` | `test-android/convert-tests.sh` | `test-android/convert-tests.sh` |  |
| pass | `scope:/filesChanged/55` | `test-android/gradle.properties` | `test-android/gradle.properties` |  |
| pass | `scope:/filesChanged/56` | `test-android/gradle/wrapper/gradle-wrapper.jar` | `test-android/gradle/wrapper/gradle-wrapper.jar` |  |
| pass | `scope:/filesChanged/57` | `test-android/gradle/wrapper/gradle-wrapper.properties` | `test-android/gradle/wrapper/gradle-wrapper.properties` |  |
| pass | `scope:/filesChanged/58` | `test-android/gradlew` | `test-android/gradlew` |  |
| pass | `scope:/filesChanged/59` | `test-android/gradlew.bat` | `test-android/gradlew.bat` |  |
| pass | `scope:/filesChanged/60` | `test-android/settings.gradle` | `test-android/settings.gradle` |  |
| pass | `scope:/filesChanged/61` | `test/CMakeLists.txt` | `test/CMakeLists.txt` |  |
| pass | `scope:/filesChanged/62` | `test/run-android-tests.sh` | `test/run-android-tests.sh` |  |
| pass | `reference:/references/0` | `{"issue":"#912","relation":"closes"}` | `{"closing":["FluidSynth/fluidsynth#912"]}` |  |
| pass | `time:/mergedAt` | `2026-09-27T13:06:24Z` | `2026-09-27T13:06:24Z` |  |

## Reading this verdict

This is a dated re-run (2026-10-06) of the published result in `../record.json` and `../summary.md`, which stand unchanged. The block is the same (`../block.json`), the report bytes are the same (sha256 above, equal to the published record's), and the head is the same. The checker is dunstan 0.1.1, whose `dist/dunstan.mjs` digest above is the one `pnpm build` reproduces at this repository's tag `v0.1.1`; the published record was written by a development build that no tag of this repository reproduces (`PROVENANCE.md`).

Claims, verdict, claims digest and evidence digest are equal to the published record's.

## Not converted

Sentences in the report that the procedure did not turn into a declared field (Rule 0):

- "an updated CI pipeline to install the required Android emulator image": asserts a change to CI configuration, not a result of this pull request's check runs, so Rule 6 declares no `checks`; the changed workflow files are in `filesChanged`, which Rule 3 takes from the files listing
- "Unit tests are not executed on ARM and AARCH64 architectures": says which tests do not run and states no count of executed tests, so Rule 5 declares no `tests`
- "No Gradle dependency / Individual test files / Better debugging / Maintainable": the Benefits list describes qualities of the change; no field in 0.1 holds such a claim
- "Co-Authored by Claude Sonnet 4.6 and Qwen 3.8.": an authorship statement; no field in 0.1 holds it

## Re-run

Offline, from the record alone (recomputes claims, verdict and digests):

```sh
pnpm run build && node dist/dunstan.mjs verify demo/2026-10/1-FluidSynth-fluidsynth-1639/rerun-v0.1.1-2026-10-06/record.json
```

Online, re-reading the same sources for the recorded block (reports `evidence_changed` if they moved):

```sh
GITHUB_TOKEN=<read token> node dist/dunstan.mjs rerun demo/2026-10/1-FluidSynth-fluidsynth-1639/rerun-v0.1.1-2026-10-06/record.json
```
