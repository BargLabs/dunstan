# JUnit reporter samples

One small JUnit XML sample per test reporter that `docs/ci-test-records.md` gives a recipe for.
**Each file was written by hand from the reporter's documented output shape. None was captured
from a run of the reporter**, so a reporter version that writes another shape is not covered here.

| Reporter | Command that writes it | Files | Test cases: executed, failed |
| --- | --- | --- | --- |
| pytest `--junitxml` | `pytest --junitxml=junit.xml` | `pytest/junit.xml` | 3, 1 (one skipped) |
| jest-junit | `jest --reporters=default --reporters=jest-junit` | `jest-junit/junit.xml` | 3, 0 |
| vitest junit reporter | `vitest run --reporter=default --reporter=junit --outputFile.junit=junit.xml` | `vitest/junit.xml` | 3, 1 |
| Maven Surefire | `mvn test` | `maven-surefire/target/surefire-reports/TEST-*.xml` (two files) | 5, 1 (one skipped) |
| Gradle | `gradle test` | `gradle/build/test-results/test/TEST-*.xml` (two files) | 3, 1 (one skipped) |
| gotestsum `--junitfile` | `gotestsum --junitfile junit.xml` | `gotestsum/junit.xml` | 3, 1 (one skipped) |

A test case is counted as spec section 7.5 counts one: executed unless it has a `skipped` child,
failed if it is executed and has a `failure` or `error` child. The suite-level `tests`, `failures`
and `skipped` attributes are not read. `src/junit/merge.test.ts` reads every sample, and merges the
Maven Surefire and Gradle files with `dunstan junit-merge`.
