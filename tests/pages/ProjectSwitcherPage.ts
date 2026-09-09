import { expect, type Locator, type Page } from "@playwright/test";
import {
  clickWithFallback,
  escapeRegex,
  hasVisibleText,
  normalizeText,
} from "../support/ui-actions";

export class ProjectSwitcherPage {
  constructor(private readonly page: Page) {}

  projectButton(projectName: string) {
    return this.page.getByRole("button", { name: new RegExp(escapeRegex(projectName), "i") }).last();
  }

  projectOptions() {
    return this.page
      .locator("button, [role='option'], [role='menuitem']")
      .filter({ hasText: /\S/ });
  }

  async ensureActiveProject(projectName: string) {
    const selectedProject = this.projectButton(projectName);
    if (await selectedProject.isVisible().catch(() => false)) {
      await this.waitForProjectApplied(projectName);
      return;
    }

    const projectSwitcher = await this.waitForProjectSwitcher(projectName);
    if (!projectSwitcher) {
      if (await hasVisibleText(this.page, new RegExp(escapeRegex(projectName), "i"))) {
        return;
      }

      throw new Error("Project switcher was not visible after login.");
    }

    await clickWithFallback(
      projectSwitcher,
      this.page,
      async () =>
        await this.projectOptions()
          .filter({ hasText: new RegExp(escapeRegex(projectName), "i") })
          .first()
          .isVisible()
          .catch(() => false)
    );
    await this.chooseConfiguredProject(projectName);
    await this.waitForProjectApplied(projectName);

    if (!await this.projectButton(projectName).isVisible().catch(() => false)) {
      throw new Error(`Unable to switch active project to "${projectName}".`);
    }
  }

  private async waitForProjectSwitcher(projectName: string) {
    await this.page.waitForLoadState("domcontentloaded").catch(() => {});

    const configuredProjectMatcher = new RegExp(escapeRegex(projectName), "i");

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const projectSwitcherCandidates = await this.page.locator("button").all();

      for (const candidate of projectSwitcherCandidates) {
        const text = normalizeText(await candidate.innerText().catch(() => ""));
        const isVisible = await candidate.isVisible().catch(() => false);
        if (!isVisible) {
          continue;
        }

        const isProfileOrAccountButton = /aakarsh|admin|logout|account/i.test(text);
        const looksLikeProjectButton =
          configuredProjectMatcher.test(text) ||
          /tower|test|project|builders|residency/i.test(text);

        if (looksLikeProjectButton && !isProfileOrAccountButton) {
          return candidate;
        }
      }

      await this.page.waitForTimeout(500);
    }

    return undefined;
  }

  private async waitForProjectApplied(projectName: string) {
    const selectedProject = this.projectButton(projectName);
    await expect
      .poll(
        async () => await selectedProject.isVisible().catch(() => false),
        {
          intervals: [500, 500, 500, 500, 500, 500, 500, 500],
          timeout: 10000,
        },
      )
      .toBeTruthy();
  }

  private async chooseConfiguredProject(projectName: string) {
    const optionLocator = this.projectOptions();
    await expect
      .poll(async () => {
        const count = await optionLocator.count().catch(() => 0);
        return count > 0;
      }, { timeout: 30000 })
      .toBeTruthy();

    const matchingOption = optionLocator
      .filter({ hasText: new RegExp(escapeRegex(projectName), "i") })
      .filter({
        hasNotText: /Agrawal builders|AIPL Riviera|Centralis|Channel partner|Citrine Crest/i
      })
      .first();

    if (await this.clickProjectOption(matchingOption)) {
      return;
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (await this.clickProjectOption(matchingOption)) {
        return;
      }

      const scrolled = await this.scrollProjectDropdown();
      if (!scrolled) {
        break;
      }

      await this.page.waitForTimeout(500);
    }

    throw new Error(`Configured project "${projectName}" was not visible in the project switcher.`);
  }

  private async clickProjectOption(option: Locator) {
    if (await option.isVisible().catch(() => false)) {
      await option.click({ force: true });
      return true;
    }

    return false;
  }

  private async scrollProjectDropdown() {
    return await this.page.evaluate(() => {
      const scrollableDivs = Array.from(document.querySelectorAll("div")).filter((element) => {
        const htmlElement = element as HTMLDivElement;
        const style = window.getComputedStyle(htmlElement);
        const rect = htmlElement.getBoundingClientRect();

        return (
          rect.width > 0 &&
          rect.height > 0 &&
          htmlElement.scrollHeight > htmlElement.clientHeight &&
          (style.overflowY === "auto" || style.overflowY === "scroll")
        );
      });

      for (const element of scrollableDivs) {
        const htmlElement = element as HTMLDivElement;
        const previousTop = htmlElement.scrollTop;
        htmlElement.scrollTop = Math.min(
          htmlElement.scrollTop + Math.max(Math.floor(htmlElement.clientHeight * 0.8), 220),
          htmlElement.scrollHeight
        );

        if (htmlElement.scrollTop !== previousTop) {
          return true;
        }
      }

      return false;
    });
  }
}
