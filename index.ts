import { readFileSync, unlinkSync } from 'fs';

import { createHash } from 'crypto';
import shellExec from 'shell-exec';

type ViolationInstance = {
  impact: string;
  html: string;
  target: Array<string>;
  failureSummary: string;
};

type ViolationType = {
  id: string;
  impact: string;
  tags: Array<string>;
  description: string;
  help: string;
  helpUrl: string;
  nodes: Array<ViolationInstance>;
};

type AxeCliResult = {
  violations: Array<ViolationType>;
};

const CHROMEDRIVER_PATH = process.env.CHROMEDRIVER_PATH || '/usr/local/bin/chromedriver';
const DEBUG = process.env.DEBUG === 'true';
const EXTRANEOUS = process.env.EXTRANEOUS === 'true';
const OUTPUT_DIRECTORY = process.env.OUTPUT_DIRECTORY || 'tmp';
const VERBOSE = process.env.VERBOSE === 'true';

(async () => {
  const urlToTest = process.argv[2];
  if (!urlToTest) {
    console.error('You must specify a URL to test');
    process.exit(1);
  }

  const urlToTestHash = createHash('sha256').update(urlToTest).digest('hex');

  const outputFilePath = `${OUTPUT_DIRECTORY}/${urlToTestHash}.json`;

  const { stderr, stdout } = await shellExec(`
    axe \
      --chromedriver-path=${CHROMEDRIVER_PATH} \
      --save ${outputFilePath} \
      ${urlToTest}
  `);

  if (stderr.length) {
    console.error(stderr.trim());
    process.exit(1);
  }

  if (!stdout.length) {
    console.error(`Could not generate report for: ${urlToTest}`);
    process.exit(1);
  }

  let axeCliResult: AxeCliResult | undefined = undefined;
  try {
    axeCliResult = JSON.parse(readFileSync(outputFilePath, 'utf-8'))[0];
  } catch (err) {
    console.error(err);
  }

  if (DEBUG) {
    console.log({ axeCliResult });
  }

  try {
    unlinkSync(outputFilePath);
  } catch (err) {
    console.error(err);
  }

  if (!axeCliResult) {
    process.exit(1);
  }

  const filteredViolationTypes = (axeCliResult?.violations || []).filter(violation => {
    if (EXTRANEOUS) {
      return true;
    } else {
      return !(violation.tags || []).includes('best-practice');
    }
  });

  if (DEBUG) {
    console.log({ filteredViolationTypes });
  }

  if (filteredViolationTypes.length === 0) {
    console.log(`No violations found for: ${urlToTest}`);
    process.exit(0);
  }

  let violationCount = 0;
  filteredViolationTypes.forEach(violationType => {
    violationCount += (violationType.nodes || []).length;
  });

  console.log(`Found ${violationCount} violations for: ${urlToTest}`);

  if (!VERBOSE) {
    process.exit(0);
  }

  filteredViolationTypes.forEach(violationType => {
    console.log({
      id: violationType.id,
      impact: violationType.impact,
      tags: (violationType.tags || []).join(', '),
      description: violationType.description,
      help: `${violationType.help} (Reference: ${violationType.helpUrl})`,
      instances: (violationType.nodes || []).map(violationInstance => {
        return {
          html: violationInstance.html,
          targets: (violationInstance.target || []).join(', '),
          summary: violationInstance.failureSummary
        };
      })
    });
  });
})();
