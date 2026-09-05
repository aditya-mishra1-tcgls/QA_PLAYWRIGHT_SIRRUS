const EVENT_PREFIX = "@@QA_DASHBOARD_EVENT@@";

function emit(type, payload = {}) {
  process.stdout.write(`${EVENT_PREFIX}${JSON.stringify({
    type,
    timestamp: new Date().toISOString(),
    ...payload
  })}\n`);
}

function locationFromTest(test) {
  return {
    file: test.location?.file || "",
    line: test.location?.line || 0,
    column: test.location?.column || 0
  };
}

export default class DashboardReporter {
  onBegin(config, suite) {
    const tests = suite.allTests();
    emit("run_begin", {
      total: tests.length,
      rootDir: config.rootDir,
      tests: tests.map((test) => ({
        testId: test.id,
        title: test.titlePath().join(" > "),
        displayTitle: test.title,
        titlePath: test.titlePath(),
        projectName: test.parent.project()?.name || "",
        ...locationFromTest(test)
      }))
    });
  }

  onTestBegin(test) {
    emit("test_begin", {
      testId: test.id,
      title: test.titlePath().join(" > "),
      displayTitle: test.title,
      titlePath: test.titlePath(),
      projectName: test.parent.project()?.name || "",
      ...locationFromTest(test)
    });
  }

  onStepBegin(test, result, step) {
    emit("step_begin", {
      testId: test.id,
      stepId: step.stepId,
      title: step.title,
      category: step.category,
      location: step.location || null
    });
  }

  onStepEnd(test, result, step) {
    emit("step_end", {
      testId: test.id,
      stepId: step.stepId,
      title: step.title,
      category: step.category,
      duration: step.duration,
      error: step.error ? {
        message: step.error.message,
        stack: step.error.stack
      } : null
    });
  }

  onTestEnd(test, result) {
    emit("test_end", {
      testId: test.id,
      title: test.titlePath().join(" > "),
      displayTitle: test.title,
      titlePath: test.titlePath(),
      status: result.status,
      expectedStatus: test.expectedStatus,
      duration: result.duration,
      errors: result.errors.map((error) => ({
        message: error.message,
        stack: error.stack
      })),
      attachments: result.attachments.map((attachment) => ({
        name: attachment.name,
        contentType: attachment.contentType,
        path: attachment.path || ""
      })),
      ...locationFromTest(test)
    });
  }

  onEnd(result) {
    emit("reporter_end", {
      status: result.status,
      startTime: result.startTime?.toISOString?.() || null,
      duration: result.duration
    });
  }
}
