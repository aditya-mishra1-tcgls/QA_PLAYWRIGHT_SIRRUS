import { expect, type Page } from "@playwright/test";
import { clickWithFallback, fillWithFallback, tryClickFirstVisible } from "../support/ui-actions";
import { MartechSegmentsPage, type OneTimeCampaignChannel } from "./MartechSegmentsPage";

export class MartechJourneyPage {
  constructor(private readonly page: Page) {}

  async createAndPublishSmsSegmentJourney(journeyName: string, segmentName: string, csvPath: string) {
    await this.createAndPublishSegmentJourney("SMS", journeyName, segmentName, csvPath);
  }

  async createAndPublishSegmentJourney(
    channel: Extract<OneTimeCampaignChannel, "SMS" | "WhatsApp" | "AI Calling">,
    journeyName: string,
    segmentName: string,
    csvPath: string,
  ) {
    await this.openJourneyBuilder();
    await this.enterJourneyDetails(journeyName);
    await this.addUploadedPhoneSegment(segmentName, csvPath);
    await this.addChannelNode(channel);
    await this.configureChannelNode(channel);
    await this.publishJourney(journeyName);
  }

  async createAndPublishEventBasedSmsJourney(journeyName: string) {
    await this.openJourneyBuilder();
    await this.enterJourneyDetails(journeyName);
    await this.configureEntryCriteriaEvent("SITE_VISIT_SCHEDULED");
    await this.addAndConfigureWaitForEvent("SITE_VISIT_SCHEDULED");
    await this.addAndConfigureEventCheck("SITE_VISIT_SCHEDULED");
    await this.addChannelNode("SMS", { plusIndex: 2 });
    await this.configureChannelNode("SMS");
    await this.publishJourney(journeyName);
  }

  async createAndPublishEventBasedWhatsAppJourneyWithGoToAndTimeDelay(journeyName: string) {
    await this.openJourneyBuilder();
    await this.fitJourneyPageToViewport();
    await this.enterJourneyDetails(journeyName);
    await this.configureEntryCriteriaEvent("SITE_VISIT_COMPLETED");
    await this.addAndConfigureTimeDelayNode();
    await this.addChannelNodeToCurrentPlaceholder("WhatsApp");
    await this.configureChannelNode("WhatsApp");
    await this.fitJourneyView();
    await this.addGoToNode();
    await this.configureGoToLoop();
    await this.publishJourney(journeyName);
  }

  async createAndPublishEventBasedAiCallingJourneyWithMessageEngagement(journeyName: string) {
    await this.openJourneyBuilder();
    await this.fitJourneyPageToViewport();
    await this.enterJourneyDetails(journeyName);
    await this.configureEntryCriteriaEvent("LEAD_CREATED");
    await this.addChannelNode("AI Calling");
    await this.configureChannelNode("AI Calling");
    await this.fitJourneyView();
    await this.addAndConfigureTimeDelayNode({ plusIndex: "last" });
    await this.fitJourneyView();
    await this.addAndConfigureMessageEngagementNode();
    await this.addChannelNodeToCurrentPlaceholder("WhatsApp");
    await this.configureChannelNode("WhatsApp");
    await this.publishJourney(journeyName);
  }

  private async openJourneyBuilder() {
    const journeyTab = this.page.getByRole("button", { name: /^Journey$/i }).first();
    if (await journeyTab.isVisible().catch(() => false)) {
      await journeyTab.click({ force: true });
    }

    const startBuilding = this.page.getByText(/Start Building/i).first();
    await expect(startBuilding).toBeVisible({ timeout: 60000 });
    await startBuilding.click({ force: true });
  }

  private async enterJourneyDetails(journeyName: string) {
    await fillWithFallback(this.page.getByRole("textbox", { name: /Enter Journey Name/i }).first(), journeyName);
    await this.selectJourneyTag();
    await fillWithFallback(this.page.getByRole("textbox", { name: /Enter a Journey Description/i }).first(), "test");

    await this.page.getByRole("button", { name: /Save Changes/i }).click({ force: true });
    await expect(this.page.getByText(/you still have work to do/i).first()).toBeVisible({ timeout: 30000 });
    await expect(this.page.getByText(/Entry Criteria/i).first()).toBeVisible({ timeout: 30000 });
  }

  private async addUploadedPhoneSegment(segmentName: string, csvPath: string) {
    await tryClickFirstVisible([
      this.page.getByText(/Entry Criteria/i).locator("xpath=ancestor::*[contains(@class,'react-flow__node') or @role='group'][1]").first(),
      this.page.locator("div:nth-child(2) > .template_personalization_label_container").first(),
      this.page.getByText(/^Segment$/i).first(),
    ], { force: true });

    await tryClickFirstVisible([
      this.page.getByText(/^Segment$/i).locator("xpath=ancestor::*[self::label or self::div][1]").first(),
      this.page.getByRole("radio").nth(1),
      this.page.getByText(/^Segment$/i).first(),
    ], { force: true });

    await tryClickFirstVisible([
      this.page.getByRole("button", { name: /Upload a CSV/i }).first(),
      this.page.getByText(/Upload a CSV/i).first(),
    ], { force: true });

    await fillWithFallback(this.page.getByRole("textbox", { name: /High_Value_Prospects/i }).first(), segmentName);
    const description = this.page.getByRole("textbox", { name: /Project with swimming pool/i }).first();
    if (await description.isVisible().catch(() => false)) {
      await fillWithFallback(description, "test");
    }

    const fileInput = this.page.locator('input[type="file"]').first();
    await expect(fileInput).toHaveCount(1, { timeout: 30000 });
    await fileInput.setInputFiles(csvPath);

    await this.selectDropdownOption(/Select Attribute Type/i, /^phone$/i);
    await this.selectDropdownOption(/Select Data Type/i, /^string$/i);
    await this.page.getByRole("button", { name: /^Create$/i }).click({ force: true });

    await this.selectCreatedSegment(segmentName);
    await this.page.getByRole("button", { name: /Save Changes/i }).click({ force: true });
  }

  private async configureEntryCriteriaEvent(eventName: string) {
    await tryClickFirstVisible([
      this.page.getByText(/Entry Criteria/i).locator("xpath=ancestor::*[contains(@class,'react-flow__node') or @role='group'][1]").first(),
      this.page.getByText(/you still have work to do/i).first(),
    ], { force: true });

    await this.selectDropdownOption(/Select a Criteria/i, new RegExp(`^${this.escapeRegex(eventName)}$`, "i"));
    await this.page.getByRole("button", { name: /Save Changes/i }).click({ force: true });
    await expect(this.page.getByText(new RegExp(this.escapeRegex(eventName), "i")).first()).toBeVisible({
      timeout: 30000,
    });
  }

  private async addAndConfigureWaitForEvent(eventName: string) {
    await this.addControlOrConditionNode("Controls", /^Wait For Event\s*Wait for event to happen before proceeding$/i, {
      plusIndex: 0,
    });
    await this.openWorkToDoNode(/Wait For Event|you still have work to do/i);
    await this.selectDropdownOption(/Select Event/i, new RegExp(`^${this.escapeRegex(eventName)}$`, "i"));
    await this.page.getByRole("button", { name: /Save Changes/i }).click({ force: true });
    await expect(this.page.getByText(new RegExp(this.escapeRegex(eventName), "i")).first()).toBeVisible({
      timeout: 30000,
    });
  }

  private async addAndConfigureEventCheck(eventName: string) {
    await this.addEventCheckNode();
    await this.openEventCheckConfiguration();
    await tryClickFirstVisible([
      this.page.getByText(/Has Performed\s*Select Event/i).first(),
      this.page.getByRole("button", { name: /Select Event/i }).first(),
      this.page.getByText(/Select Event/i).first(),
    ], { force: true });
    await this.clickDropdownOption(new RegExp(`^${this.escapeRegex(eventName)}$`, "i"));
    await this.page.getByRole("button", { name: /Save Changes/i }).click({ force: true });
    await expect(this.eventCheckNodeLocator().getByText(new RegExp(this.escapeRegex(eventName), "i")).first())
      .toBeVisible({ timeout: 30000 });
  }

  private async addAndConfigureMessageEngagementNode() {
    await this.addPaletteNodeByDrag("Conditions", /^Message Engagement\s*Branch based on message interaction$/i, {
      nodeReadyPattern: /^Message Engagement$/i,
      plusIndex: "last",
    });
    await this.openMessageEngagementConfiguration();

    await this.selectDropdownOption(/Select an engagement status/i, /^CONNECTED$/i);
    await this.selectDropdownOption(/Select an AI call outcome/i, /^POSITIVE$/i);

    const saveChanges = this.page.getByRole("button", { name: /Save Changes/i }).first();
    await expect(saveChanges).toBeEnabled({ timeout: 30000 });
    await saveChanges.click({ force: true });

    await expect(this.page.getByText(/^Message Engagement$/i).first()).toBeVisible({ timeout: 30000 });
  }

  private async openMessageEngagementConfiguration() {
    const messageEngagementNode = this.page
      .getByText(/^Message Engagement$/i)
      .locator("xpath=ancestor::*[@role='group' or contains(@class,'react-flow__node')][1]")
      .last();

    await expect(messageEngagementNode).toBeVisible({ timeout: 30000 });
    for (const candidate of [
      messageEngagementNode.getByText(/you still have work to do/i).first(),
      messageEngagementNode.getByText(/^Message Engagement$/i).first(),
      messageEngagementNode,
      this.page.getByText(/you still have work to do/i).last(),
    ]) {
      if (!await candidate.isVisible().catch(() => false)) {
        continue;
      }

      await candidate.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(700);
      if (await this.messageEngagementPanelVisible()) {
        return;
      }

      await candidate.dblclick({ force: true }).catch(() => {});
      await this.page.waitForTimeout(700);
      if (await this.messageEngagementPanelVisible()) {
        return;
      }
    }

    throw new Error("Unable to open Message Engagement configuration panel.");
  }

  private async messageEngagementPanelVisible() {
    const bodyText = await this.page.locator("body").innerText().catch(() => "");
    return /Select an engagement status|Select an AI call outcome/i.test(bodyText);
  }

  private async addAndConfigureTimeDelayNode(options: { plusIndex?: number | "first" | "last" } = {}) {
    await this.addPaletteNodeByDrag("Controls", /^Time Delay\s*Add time delays between journey steps$/i, {
      nodeReadyPattern: /^Time Delay$/i,
      plusIndex: options.plusIndex ?? 0,
    });
    await this.openWorkToDoNode(/Time Delay|Wait For|you still have work to do/i);

    await this.selectTimeDelayUnit("Minutes");

    const durationInput = this.page.getByRole("spinbutton", { name: /Enter duration/i }).first();
    await expect(durationInput).toBeVisible({ timeout: 30000 });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await durationInput.click({ force: true }).catch(() => {});
      await this.page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => {});
      await this.page.keyboard.press("Backspace").catch(() => {});
      await this.page.keyboard.type("2", { delay: 50 }).catch(() => {});
      await this.page.waitForTimeout(500);

      const enteredValue = await durationInput.inputValue().catch(() => "");
      const durationText = await this.page.locator("body").innerText().catch(() => "");
      if (enteredValue === "2" || /Wait For\s*2\s*Minutes|2\s*Minutes/i.test(durationText)) {
        break;
      }

      await this.clickRelativeToText(/^Duration$/i, 90, 40);
      await this.page.keyboard.type("2", { delay: 50 }).catch(() => {});
      await this.page.waitForTimeout(500);
      if (/Wait For\s*2\s*Minutes|2\s*Minutes/i.test(await this.page.locator("body").innerText().catch(() => ""))) {
        break;
      }
    }

    const saveChanges = this.page.getByRole("button", { name: /Save Changes/i }).first();
    await expect(saveChanges).toBeEnabled({ timeout: 30000 });
    await saveChanges.click({ force: true });
    await expect(this.page.getByText(/^Time Delay$/i).first()).toBeVisible({ timeout: 30000 });
  }

  private async addGoToNode() {
    await this.addPaletteNodeByDrag("Controls", /^Go To\s*Jump to another point in the journey$/i, {
      nodeReadyPattern: /^Go To$/i,
      plusIndex: "last",
    });
    await expect(this.page.getByText(/Go To|Jump to another point/i).first()).toBeVisible({ timeout: 30000 });
  }

  private async configureGoToLoop() {
    await this.openGoToConfiguration();

    await this.selectGoToTargetNode(/Time Delay/i);
    await this.fillGoToPassCount("1");

    const saveChanges = this.page.getByRole("button", { name: /Save Changes/i }).first();
    await expect(saveChanges).toBeEnabled({ timeout: 30000 });
    await saveChanges.click({ force: true });

    await expect(this.page.getByText(/^Go To$/i).first()).toBeVisible({ timeout: 30000 });
  }

  private async openGoToConfiguration() {
    await this.fitJourneyView();
    const goToNode = this.page
      .getByText(/^Go To$/i)
      .locator("xpath=ancestor::*[@role='group' or contains(@class,'react-flow__node')][1]")
      .last();

    await expect(goToNode).toBeVisible({ timeout: 30000 });
    for (const candidate of [
      goToNode.getByText(/^Go To$/i).first(),
      goToNode.getByText(/Configure loop/i).first(),
      goToNode,
    ]) {
      if (!await candidate.isVisible().catch(() => false)) {
        continue;
      }

      await candidate.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(700);
      if (await this.goToPanelVisible()) {
        return;
      }

      await candidate.dblclick({ force: true }).catch(() => {});
      await this.page.waitForTimeout(700);
      if (await this.goToPanelVisible()) {
        return;
      }
    }

    throw new Error("Unable to open Go To configuration panel.");
  }

  private async goToPanelVisible() {
    const bodyText = await this.page.locator("body").innerText().catch(() => "");
    return /Choose a node to jump to|maximum pass count|Go To Configuration|Select.*Node|Pass Count/i.test(bodyText);
  }

  private async selectGoToTargetNode(nodeName: RegExp) {
    const targetAlreadySelected = await this.page
      .locator("button, [role='button']")
      .filter({ hasText: nodeName })
      .first()
      .isVisible()
      .catch(() => false);
    if (targetAlreadySelected) {
      return;
    }

    const dropdownCandidates = [
      this.page.getByRole("button", { name: /Choose a node to jump to|Select.*Node|Select here/i }).first(),
      this.page.locator("button, [role='button']").filter({ hasText: /Choose a node|Select.*Node|Select here/i }).first(),
      this.page.getByText(/Choose a node to jump to|Select.*Node|Select here/i).locator("xpath=ancestor::*[self::button or @role='button'][1]").first(),
    ];

    await this.clickFirstVisibleCandidate(dropdownCandidates);
    const targetOption = this.page.locator("button, [role='button']").filter({ hasText: nodeName }).last();
    await expect(targetOption).toBeVisible({ timeout: 30000 });
    await targetOption.click({ force: true });
    await this.page.keyboard.press("Escape").catch(() => {});
  }

  private async fillGoToPassCount(passCount: string) {
    const maximumPassesDropdown = this.page
      .getByText(/^Maximum Passes$/i)
      .locator("xpath=following::button[1]")
      .first();
    if (await maximumPassesDropdown.isVisible({ timeout: 5000 }).catch(() => false)) {
      await maximumPassesDropdown.click({ force: true });
      const passOption = this.page
        .locator("button, [role='button']")
        .filter({ hasText: new RegExp(`^${this.escapeRegex(passCount)}$`) })
        .last();
      if (await passOption.isVisible({ timeout: 10000 }).catch(() => false)) {
        await passOption.click({ force: true });
        await this.page.keyboard.press("Escape").catch(() => {});
        return;
      }
    }

    const inputs = [
      this.page.getByRole("spinbutton", { name: /pass|count|maximum/i }).first(),
      this.page.getByRole("textbox", { name: /pass|count|maximum/i }).first(),
      this.page.locator("input").last(),
    ];

    for (const input of inputs) {
      if (!await input.isVisible({ timeout: 5000 }).catch(() => false)) {
        continue;
      }

      await input.click({ force: true }).catch(() => {});
      await input.fill(passCount).catch(async () => {
        await this.page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => {});
        await this.page.keyboard.type(passCount, { delay: 40 }).catch(() => {});
      });
      return;
    }

    await this.clickRelativeToText(/maximum pass count|pass count/i, 120, 42);
    await this.page.keyboard.type(passCount, { delay: 40 }).catch(() => {});
  }

  private async addEventCheckNode() {
    const previousNodeCount = await this.getJourneyProgressCount("Total Nodes");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.clickJourneyPlus(1);
      await this.selectBuilderPaletteTab("Conditions", /Event Check/i);

      const eventCheckCard = this.page
        .locator("div, button")
        .filter({ hasText: /^Event Check\s*Evaluate user actions and behaviors$/i })
        .last();
      const dropTarget = this.page.getByText(/Drag Node to add/i).last();

      await expect(eventCheckCard).toBeVisible({ timeout: 30000 });
      await expect(dropTarget).toBeVisible({ timeout: 30000 });
      await this.dragNodeCardToCanvas(eventCheckCard, dropTarget);

      if (await this.controlOrConditionNodeReady(previousNodeCount, 7000)) {
        return;
      }
    }

    throw new Error("Unable to add Event Check journey node.");
  }

  private async openEventCheckConfiguration() {
    await this.fitJourneyView();
    const eventCheckNode = this.eventCheckNodeLocator();
    const eventCheckWorkToDo = eventCheckNode.getByText(/you still have work to do/i).first();

    await expect(eventCheckNode).toBeVisible({ timeout: 30000 });
    for (const candidate of [
      eventCheckWorkToDo,
      eventCheckNode.getByText(/^Event Check$/i).first(),
      eventCheckNode,
    ]) {
      if (!await candidate.isVisible().catch(() => false)) {
        continue;
      }

      await candidate.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(700);
      const panelOpened = await this.page
        .getByText(/Event Check Configuration|Has Performed\s*Select Event|Select Event/i)
        .first()
        .isVisible()
        .catch(() => false);
      if (panelOpened) {
        return;
      }
    }

    const nodeBox = await eventCheckNode.boundingBox().catch(() => null);
    if (nodeBox) {
      const clickPoints = [
        { x: nodeBox.x + nodeBox.width / 2, y: nodeBox.y + nodeBox.height * 0.62 },
        { x: nodeBox.x + nodeBox.width / 2, y: nodeBox.y + nodeBox.height / 2 },
        { x: nodeBox.x + nodeBox.width * 0.28, y: nodeBox.y + nodeBox.height * 0.35 },
      ];

      for (const point of clickPoints) {
        await this.page.mouse.click(point.x, point.y);
        await this.page.waitForTimeout(700);
        if (await this.eventCheckPanelOpened()) {
          return;
        }

        await this.page.mouse.dblclick(point.x, point.y).catch(() => {});
        await this.page.waitForTimeout(1000);
        if (await this.eventCheckPanelOpened()) {
          return;
        }
      }
    }

    throw new Error("Unable to open Event Check configuration panel.");
  }

  private async eventCheckPanelOpened() {
    const selectEventVisible = await this.page
      .getByRole("button", { name: /Select Event/i })
      .first()
      .isVisible()
      .catch(() => false);
    const configurationVisible = await this.page
      .getByText(/Event Check Configuration/i)
      .first()
      .isVisible()
      .catch(() => false);
    return selectEventVisible || configurationVisible;
  }

  private eventCheckNodeLocator() {
    return this.page
      .getByText(/^Event Check$/i)
      .locator("xpath=ancestor::*[@role='group' or contains(@class,'react-flow__node')][1]")
      .last();
  }

  private async dragNodeCardToCanvas(
    source: ReturnType<Page["locator"]>,
    target: ReturnType<Page["locator"]>,
  ) {
    await source.scrollIntoViewIfNeeded().catch(() => {});
    await target.scrollIntoViewIfNeeded().catch(() => {});

    const sourceBox = await source.boundingBox().catch(() => null);
    const targetBox = await target.boundingBox().catch(() => null);
    if (!sourceBox || !targetBox) {
      await source.dragTo(target, { force: true }).catch(() => {});
      return;
    }

    await this.page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 20 });
    await this.page.waitForTimeout(300);
    await this.page.mouse.up();
    await this.page.waitForTimeout(1000);
  }

  private async addControlOrConditionNode(
    tabName: "Controls" | "Conditions",
    cardPattern: RegExp,
    options: { plusIndex?: number } = {},
  ) {
    const previousNodeCount = await this.getJourneyProgressCount("Total Nodes");
    await this.clickJourneyPlus(options.plusIndex ?? "last");

    const card = this.page
      .locator("div, button, p")
      .filter({ hasText: cardPattern })
      .first();
    const dropTarget = this.page.getByText(/Drag Node to add/i).last();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.selectBuilderPaletteTab(tabName, cardPattern);
      await expect(card).toBeVisible({ timeout: 30000 });

      await card.click({ force: true }).catch(async () => {
        const box = await card.boundingBox().catch(() => null);
        if (box) {
          await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        }
      });

      if (await this.controlOrConditionNodeReady(previousNodeCount, 5000)) {
        return;
      }

      if (await dropTarget.isVisible().catch(() => false)) {
        await card.dragTo(dropTarget, { force: true }).catch(async () => {
          const sourceBox = await card.boundingBox().catch(() => null);
          const targetBox = await dropTarget.boundingBox().catch(() => null);
          if (!sourceBox || !targetBox) {
            return;
          }
          await this.page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
          await this.page.mouse.down();
          await this.page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
          await this.page.mouse.up();
        });

        if (await this.controlOrConditionNodeReady(previousNodeCount, 5000)) {
          return;
        }
      }

      await this.clickJourneyPlus(options.plusIndex ?? "last");
    }

    throw new Error(`Unable to add ${tabName} journey node matching ${cardPattern}.`);
  }

  private async addPaletteNodeByDrag(
    tabName: "Channels" | "Controls" | "Conditions",
    cardPattern: RegExp,
    options: { nodeReadyPattern?: RegExp; plusIndex?: number | "first" | "last"; clickPlus?: boolean } = {},
  ) {
    const previousNodeCount = await this.getJourneyProgressCount("Total Nodes");
    if (options.clickPlus !== false) {
      await this.clickJourneyPlus(options.plusIndex ?? "last");
    }

    await this.selectBuilderPaletteTab(tabName, cardPattern);

    const card = this.page.locator("div, button").filter({ hasText: cardPattern }).last();
    const dropTarget = this.page.getByText(/Drag Node to add/i).last();
    await expect(card).toBeVisible({ timeout: 30000 });
    await expect(dropTarget).toBeVisible({ timeout: 30000 });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.dragNodeCardToCanvas(card, dropTarget);
      if (
        await this.controlOrConditionNodeReady(previousNodeCount, 7000) ||
        await this.canvasNodeVisible(options.nodeReadyPattern ?? cardPattern)
      ) {
        return;
      }
      await this.selectBuilderPaletteTab(tabName, cardPattern);
    }

    throw new Error(`Unable to drag journey node matching ${cardPattern}.`);
  }

  private async canvasNodeVisible(pattern: RegExp) {
    return await this.page
      .getByText(pattern)
      .locator("xpath=ancestor::*[@role='group' or contains(@class,'react-flow__node')][1]")
      .last()
      .isVisible({ timeout: 3000 })
      .catch(() => false);
  }

  private async addChannelNodeToCurrentPlaceholder(
    channel: Extract<OneTimeCampaignChannel, "SMS" | "WhatsApp" | "AI Calling">,
  ) {
    await this.addPaletteNodeByDrag("Channels", this.channelCardPattern(channel), {
      plusIndex: "last",
      nodeReadyPattern: this.channelNodePattern(channel),
    });
  }

  private async openWorkToDoNode(nodePattern: RegExp) {
    for (const candidate of [
      this.page.getByText(/you still have work to do/i).last(),
      this.page.getByText(nodePattern).locator("xpath=ancestor::*[contains(@class,'react-flow__node') or contains(@class,'rounded')][1]").first(),
      this.page.getByText(nodePattern).first(),
    ]) {
      if (!await candidate.isVisible().catch(() => false)) {
        continue;
      }
      await candidate.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(500);
      return;
    }
  }

  private async selectCreatedSegment(segmentName: string) {
    const searchInput = await this.openCreatedSegmentDropdown();
    await fillWithFallback(searchInput, segmentName);

    const segmentOption = this.page
      .locator("button, [role='button']")
      .filter({ hasText: new RegExp(this.escapeRegex(segmentName), "i") })
      .last();
    await expect(segmentOption).toBeVisible({ timeout: 60000 });
    await segmentOption.click({ force: true });
    await expect(this.page.getByRole("button", { name: new RegExp(this.escapeRegex(segmentName), "i") }).first())
      .toBeVisible({ timeout: 30000 });
  }

  private async selectJourneyTag() {
    const trigger = this.page.getByRole("button", { name: /Choose a Tag/i }).first();
    await expect(trigger).toBeVisible({ timeout: 30000 });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await trigger.click({ force: true });
      await this.page.waitForTimeout(1200);

      const searchInput = this.page.getByRole("textbox", { name: /^Search$/i }).first();
      if (await searchInput.isVisible().catch(() => false)) {
        await searchInput.fill("").catch(() => {});
      }

      const preferredTag = this.page.locator("button, [role='button']").filter({ hasText: /Test journey|test/i }).last();
      if (await preferredTag.isVisible({ timeout: 3000 }).catch(() => false)) {
        await preferredTag.click({ force: true });
        await this.page.keyboard.press("Escape").catch(() => {});
        return;
      }

      const firstAvailableTag = this.page
        .locator("button, [role='button']")
        .filter({ hasNotText: /Choose a Tag|Save Changes|Cancel|Sorry, no results/i })
        .filter({ hasText: /\S/ })
        .last();
      if (await firstAvailableTag.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstAvailableTag.click({ force: true });
        await this.page.keyboard.press("Escape").catch(() => {});
        return;
      }

      await this.page.keyboard.press("Escape").catch(() => {});
      await this.page.waitForTimeout(2000);
    }

    throw new Error("Unable to select a journey tag because no tag options were available.");
  }

  private async openCreatedSegmentDropdown() {
    const chooseSegment = this.page.getByRole("button", { name: /Choose a segment to start/i }).first();
    await expect(chooseSegment).toBeVisible({ timeout: 60000 });

    const searchInput = this.page.getByRole("textbox", { name: /^Search$/i }).first();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await chooseSegment.scrollIntoViewIfNeeded().catch(() => {});
      await clickWithFallback(
        chooseSegment,
        this.page,
        async () => await searchInput.isVisible().catch(() => false),
        { force: true },
        1000,
      ).catch(() => {});

      if (await searchInput.isVisible().catch(() => false)) {
        return searchInput;
      }

      const box = await chooseSegment.boundingBox().catch(() => null);
      if (box) {
        await this.page.mouse.click(box.x + box.width - 24, box.y + box.height / 2);
        if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          return searchInput;
        }
      }

      await chooseSegment.locator("svg, img").last().click({ force: true }).catch(() => {});
      if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        return searchInput;
      }

      await this.page.waitForTimeout(1000);
    }

    throw new Error("Unable to open the journey segment dropdown search.");
  }

  private async addSmsNode() {
    await this.addChannelNode("SMS");
  }

  private async addChannelNode(
    channel: Extract<OneTimeCampaignChannel, "SMS" | "WhatsApp" | "AI Calling">,
    options: { plusIndex?: number } = {},
  ) {
    await this.clickJourneyPlus(options.plusIndex ?? "first");

    const channelPattern = this.channelCardPattern(channel);
    const channelCard = this.page
      .locator("div, button")
      .filter({ hasText: channelPattern })
      .first();
    const dropTarget = this.page.getByText(/Drag Node to add/i).first();

    await expect(channelCard).toBeVisible({ timeout: 30000 });
    await expect(dropTarget).toBeVisible({ timeout: 30000 });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await channelCard.scrollIntoViewIfNeeded().catch(() => {});
      await dropTarget.scrollIntoViewIfNeeded().catch(() => {});

      await channelCard.dragTo(dropTarget, { force: true }).catch(async () => {
        const sourceBox = await channelCard.boundingBox().catch(() => null);
        const targetBox = await dropTarget.boundingBox().catch(() => null);
        if (!sourceBox || !targetBox) {
          return;
        }
        await this.page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
        await this.page.mouse.down();
        await this.page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
        await this.page.mouse.up();
      });

      const added = await this.channelNodeAdded(channel);
      if (added) {
        return;
      }

      await channelCard.click({ force: true }).catch(() => {});
      await dropTarget.click({ force: true }).catch(() => {});
      if (await this.channelNodeAdded(channel)) {
        return;
      }

      await this.page.waitForTimeout(1000);
    }

    throw new Error(`Unable to add ${channel} node to the journey canvas.`);
  }

  private async clickJourneyPlus(preferred: number | "first" | "last") {
    const plusLocator = this.page.getByText(/^\+$/);
    const indexedPlus = typeof preferred === "number" ? plusLocator.nth(preferred) : undefined;
    const fallbackPlus = preferred === "first" ? plusLocator.first() : plusLocator.last();

    await tryClickFirstVisible([
      ...(indexedPlus ? [indexedPlus] : []),
      fallbackPlus,
      this.page.locator("text=+").last(),
      this.page.locator("text=+").first(),
    ], { force: true });
    await this.page.waitForTimeout(500);
  }

  private async selectBuilderPaletteTab(tabName: "Channels" | "Controls" | "Conditions", expectedCardPattern: RegExp) {
    const expectedCard = this.page.locator("div, button, p").filter({ hasText: expectedCardPattern }).first();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const tabButton = this.page.getByRole("button", { name: new RegExp(`^${tabName}$`, "i") }).first();
      if (await tabButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await tabButton.click({ force: true }).catch(async () => {
          await tabButton.evaluate((element) => (element as HTMLElement).click()).catch(() => {});
        });
      } else {
        await this.page.evaluate((targetTabName) => {
          const tab = Array.from(document.querySelectorAll<HTMLElement>("button, [role='button']"))
            .find((element) => element.innerText.trim() === targetTabName || element.textContent?.trim() === targetTabName);
          tab?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        }, tabName).catch(() => {});
      }

      await this.page.waitForTimeout(700);
      if (await expectedCard.isVisible().catch(() => false)) {
        return;
      }
    }

    await expect(expectedCard).toBeVisible({ timeout: 30000 });
  }

  private async controlOrConditionNodeReady(previousNodeCount: number | null, timeout = 8000) {
    return await expect
      .poll(async () => {
        const workToDoVisible = await this.page.getByText(/you still have work to do/i).first().isVisible().catch(() => false);
        const currentNodeCount = await this.getJourneyProgressCount("Total Nodes");
        const nodeCountIncreased =
          previousNodeCount !== null &&
          currentNodeCount !== null &&
          currentNodeCount > previousNodeCount;
        return previousNodeCount !== null && currentNodeCount !== null ? nodeCountIncreased : workToDoVisible;
      }, { timeout })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);
  }

  private async getJourneyProgressCount(label: string) {
    const bodyText = await this.page.locator("body").innerText().catch(() => "");
    const match = bodyText.match(new RegExp(`${this.escapeRegex(label)}\\s+(\\d+)`, "i"));
    return match?.[1] ? Number(match[1]) : null;
  }

  private async smsNodeAdded() {
    return await this.channelNodeAdded("SMS");
  }

  private async channelNodeAdded(channel: Extract<OneTimeCampaignChannel, "SMS" | "WhatsApp" | "AI Calling">) {
    const nodePattern = this.channelNodePattern(channel);
    return await expect
      .poll(async () => {
        const channelNodeVisible = await this.page
          .getByText(nodePattern)
          .first()
          .isVisible()
          .catch(() => false);
        const placeholderVisible = await this.page.getByText(/Drag Node to add/i).first().isVisible().catch(() => false);
        return channelNodeVisible && !placeholderVisible;
      }, { timeout: 8000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);
  }

  private async configureSmsNode() {
    await this.configureChannelNode("SMS");
  }

  private async configureChannelNode(channel: Extract<OneTimeCampaignChannel, "SMS" | "WhatsApp" | "AI Calling">) {
    const contentOpened = await this.openChannelContentConfiguration(channel);
    if (!contentOpened) {
      throw new Error(`Unable to open ${channel} journey node content configuration.`);
    }

    await new MartechSegmentsPage(this.page).configureChannelContentForOpenBuilder(channel);
  }

  private async openSmsContentConfiguration() {
    return await this.openChannelContentConfiguration("SMS");
  }

  private async openChannelContentConfiguration(channel: Extract<OneTimeCampaignChannel, "SMS" | "WhatsApp" | "AI Calling">) {
    const contentReady = async () => {
      if (channel === "WhatsApp") {
        return await this.page.getByRole("button", { name: /Select a Sender ID|Select a Template|siruss\.ai/i }).first()
          .isVisible()
          .catch(() => false);
      }

      if (channel === "AI Calling") {
        return await this.page.getByRole("button", { name: /Select the scenario/i }).first()
          .isVisible()
          .catch(() => false);
      }

      const sender = await this.page.getByRole("button", { name: /Select a Sender Name|MYZIKI/i }).first()
        .isVisible()
        .catch(() => false);
      const dlt = await this.page.getByRole("textbox", { name: /Enter DLT Template ID/i }).first()
        .isVisible()
        .catch(() => false);
      return sender || dlt;
    };

    if (channel === "SMS" && await this.openSmsNodeWorkToDo(contentReady)) {
      return true;
    }

    const setupButtonCandidates = [
      this.page.getByRole("button", { name: /Set up Content/i }).first(),
      this.page.getByText(/Set up Content/i).locator("xpath=ancestor::button[1]").first(),
      this.page.getByText(/Set up Content/i).first(),
    ];

    for (const candidate of setupButtonCandidates) {
      if (!await candidate.isVisible().catch(() => false)) {
        continue;
      }
      await clickWithFallback(candidate, this.page, contentReady, { force: true }, 1000).catch(() => {});
      if (await contentReady()) {
        return true;
      }
    }

    const nodePattern = this.channelNodePattern(channel);
    const nodeCandidates = [
      this.page.getByText(nodePattern).locator("xpath=ancestor::*[contains(@class,'react-flow__node')][1]").first(),
      this.page.getByText(nodePattern).first(),
      this.page.getByText(/you still have work to do/i).locator("xpath=ancestor::*[contains(@class,'react-flow__node') or contains(@class,'rounded')][1]").first(),
      this.page.getByText(/you still have work to do/i).first(),
    ];

    for (const candidate of nodeCandidates) {
      if (!await candidate.isVisible().catch(() => false)) {
        continue;
      }
      await candidate.scrollIntoViewIfNeeded().catch(() => {});
      await candidate.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(700);
      if (await contentReady()) {
        return true;
      }
      await this.page.waitForTimeout(1000);
      for (const setupButton of setupButtonCandidates) {
        if (await setupButton.isVisible().catch(() => false)) {
          await setupButton.click({ force: true }).catch(() => {});
          if (await contentReady()) {
            return true;
          }
        }
      }

      await candidate.dblclick({ force: true }).catch(() => {});
      await this.page.waitForTimeout(1000);
      if (await contentReady()) {
        return true;
      }

      if (await contentReady()) {
        return true;
      }
    }

    const viewport = this.page.viewportSize() ?? { width: 1280, height: 720 };
    for (const clickPoint of [
      { x: viewport.width * 0.53, y: viewport.height * 0.90 },
      { x: viewport.width * 0.53, y: viewport.height * 0.84 },
    ]) {
      await this.page.mouse.click(clickPoint.x, clickPoint.y);
      await this.page.waitForTimeout(700);
      if (await contentReady()) {
        return true;
      }
      await this.page.mouse.dblclick(clickPoint.x, clickPoint.y).catch(() => {});
      await this.page.waitForTimeout(1000);
      if (await contentReady()) {
        return true;
      }
    }

    return await contentReady();
  }

  private async openSmsNodeWorkToDo(contentReady: () => Promise<boolean>) {
    await this.fitJourneyView();
    const smsNode = this.page
      .getByText(/^SMS$/i)
      .locator("xpath=ancestor::*[@role='group' or contains(@class,'react-flow__node')][1]")
      .last();

    if (!await smsNode.isVisible().catch(() => false)) {
      return false;
    }

    const candidates = [
      smsNode.getByText(/you still have work to do/i).first(),
      smsNode.getByText(/^SMS$/i).first(),
      smsNode,
    ];

    for (const candidate of candidates) {
      if (!await candidate.isVisible().catch(() => false)) {
        continue;
      }

      await candidate.scrollIntoViewIfNeeded().catch(() => {});
      await candidate.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(800);
      if (await contentReady()) {
        return true;
      }

      await candidate.dblclick({ force: true }).catch(() => {});
      await this.page.waitForTimeout(1000);
      if (await contentReady()) {
        return true;
      }
    }

    return false;
  }

  private async fitJourneyView() {
    await this.page.getByRole("button", { name: /Fit View/i }).click({ force: true }).catch(() => {});
    await this.page.waitForTimeout(800);
  }

  private async fitJourneyPageToViewport() {
    await this.page.addStyleTag({
      content: `
        html,
        body,
        #root {
          zoom: 0.86;
        }
      `,
    }).catch(() => {});
    await this.fitJourneyView();
  }

  private async selectTimeDelayUnit(unitName: "Minutes" | "Hours") {
    const timeUnitButton = this.page.getByRole("button", { name: /Hours|Minutes/i }).first();
    if (!await timeUnitButton.isVisible({ timeout: 10000 }).catch(() => false)) {
      return;
    }

    const selectedUnit = await timeUnitButton.innerText().catch(() => "");
    if (new RegExp(unitName, "i").test(selectedUnit)) {
      return;
    }

    await timeUnitButton.click({ force: true });
    const unitOption = this.page.getByRole("button", { name: new RegExp(`^${unitName}$`, "i") }).last();
    await expect(unitOption).toBeVisible({ timeout: 10000 });
    await unitOption.click({ force: true });
    await this.page.keyboard.press("Escape").catch(() => {});
  }

  private async publishJourney(journeyName: string) {
    await this.clickPublishJourneyButton();
    await this.completeOneTimePublishOptions();

    const modalPublishButton = this.page.locator("#root-modal").getByRole("button", { name: /^Publish$/i }).first();
    if (await modalPublishButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await modalPublishButton.click({ force: true });
    }

    await expect
      .poll(async () => {
        const bodyText = await this.page.locator("body").innerText().catch(() => "");
        const listingSearchVisible = await this.page.getByRole("textbox", { name: /Search by Journey Name/i })
          .first()
          .isVisible()
          .catch(() => false);
        return listingSearchVisible || /published|success|created|journey published/i.test(bodyText);
      }, { timeout: 60000 })
      .toBeTruthy();

    await this.verifyPublishedJourneyFromListing(journeyName);
  }

  private async clickPublishJourneyButton() {
    const publishDialogOpened = async () => await this.publishScheduleVisible();
    const candidates = [
      this.page.getByRole("button", { name: /^Publish Journey$/i }).first(),
      this.page.locator("button").filter({ hasText: /^Publish Journey$/i }).first(),
      this.page.getByText(/^Publish Journey$/i).locator("xpath=ancestor::button[1]").first(),
      this.page.getByText(/^Publish Journey$/i).locator("xpath=ancestor::*[contains(@class,'cursor-pointer')][1]").first(),
      this.page.getByText(/^Publish Journey$/i).last(),
    ];

    for (const candidate of candidates) {
      if (!await candidate.isVisible({ timeout: 5000 }).catch(() => false)) {
        continue;
      }

      await candidate.scrollIntoViewIfNeeded().catch(() => {});
      await clickWithFallback(candidate, this.page, publishDialogOpened, { force: true }, 1500).catch(async () => {
        const box = await candidate.boundingBox().catch(() => null);
        if (box) {
          await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        }
      });

      if (await publishDialogOpened()) {
        return;
      }
    }

    const viewport = this.page.viewportSize() ?? { width: 1280, height: 720 };
    await this.page.mouse.click(viewport.width - 85, 120);
    await expect.poll(publishDialogOpened, { timeout: 30000 }).toBeTruthy();
  }

  private async completeOneTimePublishOptions() {
    await this.selectOneTimeFrequency();

    await this.selectEndNeverIfVisible();

    const dateButtonClicked = await this.clickFirstVisibleCandidate([
      this.page.getByRole("button", { name: /Select Date/i }).first(),
      this.page.locator("button").filter({ hasText: /Select Date/i }).first(),
      this.page.getByText(/^Select Date$/i).locator("xpath=ancestor::*[self::button or self::div][1]").first(),
    ]);
    if (dateButtonClicked) {
      await this.selectFirstVisibleOption([
        this.page.getByRole("option", { name: /Choose/i }).nth(1),
        this.page.getByRole("option", { name: /Choose/i }).nth(2),
        this.page.locator('[role="option"], button').filter({ hasText: /^\d{1,2}$/ }).nth(1),
        this.page.locator('[role="option"], button').filter({ hasText: /^\d{1,2}$/ }).nth(2),
      ]);
    }

    await this.selectStartTimeIfNeeded();
    await this.selectEndNeverIfVisible();
    await this.selectOverrideDndIfVisible();
    await this.selectEndDateTimeIfNeeded();
    await this.selectOverrideDndIfVisible();

    await this.clickReadyModalPublishJourneyButton();
  }

  private async selectOneTimeFrequency() {
    const frequencyTrigger = this.page
      .locator("button, [role='button']")
      .filter({ hasText: /^(Daily|Weekly|Monthly|One Time)$/i })
      .first();

    if (await frequencyTrigger.isVisible({ timeout: 5000 }).catch(() => false)) {
      const selectedFrequency = await frequencyTrigger.innerText().catch(() => "");
      if (/one time/i.test(selectedFrequency)) {
        return;
      }

      await frequencyTrigger.click({ force: true });
      await this.page.waitForTimeout(500);
    }

    const oneTimeOption = this.page
      .locator("button, [role='button']")
      .filter({ hasText: /^One Time$/i })
      .last();
    if (!await oneTimeOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      if (await this.publishScheduleVisible()) {
        return;
      }
    }

    await expect(oneTimeOption).toBeVisible({ timeout: 30000 });
    await oneTimeOption.click({ force: true });
    await this.page.keyboard.press("Escape").catch(() => {});
  }

  private async clickReadyModalPublishJourneyButton() {
    await this.page.locator("#root-modal").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    }).catch(() => {});
    await this.page.mouse.wheel(0, 900).catch(() => {});
    await this.page.waitForTimeout(500);

    const candidates = [
      this.page.getByRole("button", { name: /^Publish Journey$/i }).last(),
      this.page.getByRole("button", { name: /^Publish$/i }).last(),
      this.page.getByText(/^Publish Journey$/i).locator("xpath=ancestor::button[1]").last(),
      this.page.getByText(/^Publish$/i).locator("xpath=ancestor::button[1]").last(),
      this.page.locator("button").filter({ hasText: /^(Publish Journey|Publish)$/i }).last(),
    ];

    for (const publishButton of candidates) {
      if (!await publishButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        continue;
      }

      await expect(publishButton).toBeEnabled({ timeout: 30000 });
      await publishButton.scrollIntoViewIfNeeded().catch(() => {});
      await publishButton.click({ force: true });
      return;
    }

    throw new Error("Unable to find the final Publish Journey button in the scheduling modal.");
  }

  private async publishScheduleVisible() {
    const rootModalVisible = await this.page.locator("#root-modal").isVisible().catch(() => false);
    const bodyText = await this.page.locator("body").innerText().catch(() => "");
    return rootModalVisible || /Journey Schedule|Start Date|Start Time|Schedule for later|Select Date|Select Time/i
      .test(bodyText);
  }

  private async publishJourneyButtonEnabled() {
    return await this.page
      .locator("button")
      .filter({ hasText: /^Publish Journey$/i })
      .last()
      .isEnabled()
      .catch(() => false);
  }

  private async selectEndDateTimeIfNeeded() {
    const endDateButton = this.page.getByRole("button", { name: /^Select Date$/i }).last();
    if (await endDateButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await endDateButton.click({ force: true });
      const selectedDate = await this.selectFirstVisibleOption([
        this.page.getByRole("option", { name: /Choose/i }).nth(2),
        this.page.getByRole("option", { name: /Choose/i }).nth(3),
        this.page.locator('[role="option"], button').filter({ hasText: /^\d{1,2}$/ }).nth(2),
        this.page.locator('[role="option"], button').filter({ hasText: /^\d{1,2}$/ }).nth(3),
        this.page.getByRole("option", { name: /Choose/i }).last(),
      ]);
      if (!selectedDate) {
        await this.page.keyboard.press("ArrowRight").catch(() => {});
        await this.page.keyboard.press("Enter").catch(() => {});
      }
      await this.page.keyboard.press("Escape").catch(() => {});
      await this.page.waitForTimeout(500);
    }

    if (!await this.page.getByRole("button", { name: /^Select Time$/i }).last().isVisible({ timeout: 5000 }).catch(() => false)) {
      return;
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await this.clickRelativeToText(/^End Time$/i, 105, 42);
      await this.page.waitForTimeout(500);
      const selected = await this.selectFirstVisibleOption([
        this.page.getByRole("option", { name: /\d{1,2}:\d{2}\s*(AM|PM)/i }).nth(3),
        this.page.locator('[role="option"], button').filter({ hasText: /\d{1,2}:\d{2}\s*(AM|PM)/i }).nth(3),
        this.page.getByRole("option", { name: /\d{1,2}:\d{2}\s*(AM|PM)/i }).last(),
      ]);
      if (selected || !await this.page.getByRole("button", { name: /^Select Time$/i }).last().isVisible().catch(() => false)) {
        return;
      }

      const endTimeButton = this.page.getByRole("button", { name: /^Select Time$/i }).last();
      const endTimeBox = await endTimeButton.boundingBox().catch(() => null);
      if (endTimeBox) {
        await this.page.mouse.click(endTimeBox.x + endTimeBox.width - 28, endTimeBox.y + endTimeBox.height / 2);
        await this.page.waitForTimeout(500);
        await endTimeButton.locator("svg, img").last().click({ force: true }).catch(() => {});
        await this.page.waitForTimeout(500);
        if (await this.selectFirstVisibleOption([
          this.page.getByRole("option", { name: /\d{1,2}:\d{2}\s*(AM|PM)/i }).last(),
          this.page.locator('[role="option"], button').filter({ hasText: /\d{1,2}:\d{2}\s*(AM|PM)/i }).last(),
        ])) {
          return;
        }
      }

      await this.page.keyboard.press("ArrowDown").catch(() => {});
      await this.page.keyboard.press("Enter").catch(() => {});
      await this.page.waitForTimeout(500);
      if (!await this.page.getByRole("button", { name: /^Select Time$/i }).last().isVisible().catch(() => false)) {
        return;
      }
    }

    await expect(this.page.getByRole("button", { name: /^Select Time$/i }).last()).not.toBeVisible({ timeout: 5000 });
  }

  private async selectEndNeverIfVisible() {
    const neverText = this.page.getByText(/^Never$/i).last();
    if (!await neverText.isVisible({ timeout: 3000 }).catch(() => false)) {
      return;
    }

    await this.page.evaluate(() => {
      const neverLabel = Array.from(document.querySelectorAll<HTMLElement>("p, span, div"))
        .find((element) => element.textContent?.trim() === "Never");
      const clickable =
        neverLabel?.closest<HTMLElement>("[class*='cursor-pointer']") ??
        neverLabel?.closest<HTMLElement>("label") ??
        neverLabel?.parentElement;
      clickable?.click();
      clickable?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    }).catch(() => {});

    await neverText.click({ force: true }).catch(() => {});
    const box = await neverText.boundingBox().catch(() => null);
    if (box) {
      await this.page.mouse.click(Math.max(0, box.x - 26), box.y + box.height / 2);
    }
    await this.page.waitForTimeout(500);
  }

  private async selectOverrideDndIfVisible() {
    const dndLabel = this.page.getByText(/Override DND settings/i).last();
    if (!await dndLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
      return;
    }

    await this.page.evaluate(() => {
      const dndText = Array.from(document.querySelectorAll<HTMLElement>("p, span, div"))
        .find((element) => /Override DND settings/i.test(element.textContent ?? ""));
      const section =
        dndText?.closest<HTMLElement>("[class*='flex']")?.parentElement ??
        dndText?.parentElement?.parentElement ??
        dndText?.parentElement;
      const checkbox = section?.querySelector<HTMLElement>("input[type='checkbox'], [role='checkbox']");
      const toggle =
        checkbox ??
        section?.querySelector<HTMLElement>("[class*='cursor-pointer']") ??
        dndText?.closest<HTMLElement>("[class*='cursor-pointer']");
      toggle?.click();
      toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    }).catch(() => {});

    const checkbox = this.page.locator("input[type='checkbox']").last();
    if (await checkbox.isVisible().catch(() => false)) {
      await checkbox.check({ force: true }).catch(() => {});
      await checkbox.evaluate((element) => {
        const target = element as HTMLInputElement;
        target.checked = true;
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
        target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      }).catch(() => {});
    }

    const labelBox = await dndLabel.boundingBox().catch(() => null);
    if (labelBox) {
      await this.page.mouse.click(labelBox.x + 225, labelBox.y + labelBox.height / 2);
      await this.page.waitForTimeout(250);
      await this.page.mouse.click(labelBox.x + 245, labelBox.y + labelBox.height / 2);
    }
    await this.page.waitForTimeout(500);
  }

  private async clickRelativeToText(text: RegExp, offsetX: number, offsetY: number) {
    const label = this.page.getByText(text).last();
    if (!await label.isVisible({ timeout: 3000 }).catch(() => false)) {
      return false;
    }

    const box = await label.boundingBox().catch(() => null);
    if (!box) {
      return false;
    }

    await this.page.mouse.click(box.x + offsetX, box.y + offsetY);
    return true;
  }

  private async selectStartTimeIfNeeded() {
    const startTimeButton = this.page.getByRole("button", { name: /^Select Time$/i }).first();
    if (!await startTimeButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      return;
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await startTimeButton.scrollIntoViewIfNeeded().catch(() => {});
      await startTimeButton.click().catch(async () => {
        await startTimeButton.evaluate((element) => (element as HTMLElement).click()).catch(() => {});
      });
      await this.page.waitForTimeout(500);

      let selected = await this.selectFirstVisibleOption([
        this.page.getByRole("option", { name: /\d{1,2}:\d{2}\s*(AM|PM)/i }).nth(2),
        this.page.locator('[role="option"], button').filter({ hasText: /\d{1,2}:\d{2}\s*(AM|PM)/i }).nth(2),
        this.page.getByText(/\d{1,2}:\d{2}\s*(AM|PM)/i).nth(2),
        this.page.getByRole("option", { name: /\d{1,2}:\d{2}\s*(AM|PM)/i }).last(),
        this.page.getByText(/\d{1,2}:\d{2}\s*(AM|PM)/i).last(),
      ]);
      if (selected || await this.startTimeSelected()) {
        return;
      }

      const listClickBox = await startTimeButton.boundingBox().catch(() => null);
      if (listClickBox) {
        await this.page.mouse.click(listClickBox.x + listClickBox.width / 2, Math.max(80, listClickBox.y - 50));
        await this.page.waitForTimeout(500);
        if (await this.startTimeSelected()) {
          return;
        }
      }

      await this.page.keyboard.press("ArrowDown").catch(() => {});
      await this.page.keyboard.press("Enter").catch(() => {});
      await this.page.waitForTimeout(500);
      if (await this.startTimeSelected()) {
        return;
      }

      const box = await startTimeButton.boundingBox().catch(() => null);
      if (box) {
        await this.page.mouse.click(box.x + box.width - 28, box.y + box.height / 2);
        await this.page.waitForTimeout(500);
        selected = await this.selectFirstVisibleOption([
          this.page.getByRole("option", { name: /\d{1,2}:\d{2}\s*(AM|PM)/i }).nth(2),
          this.page.locator('[role="option"], button').filter({ hasText: /\d{1,2}:\d{2}\s*(AM|PM)/i }).nth(2),
          this.page.getByText(/\d{1,2}:\d{2}\s*(AM|PM)/i).nth(2),
          this.page.getByRole("option", { name: /\d{1,2}:\d{2}\s*(AM|PM)/i }).last(),
          this.page.getByText(/\d{1,2}:\d{2}\s*(AM|PM)/i).last(),
        ]);
        if (selected || await this.startTimeSelected()) {
          return;
        }
      }
    }

    throw new Error("Unable to select journey start time.");
  }

  private async startTimeSelected() {
    const startTimeButton = this.page.getByRole("button", { name: /^Select Time$/i }).first();
    const stillNeedsSelection = await startTimeButton.isVisible().catch(() => false);
    const publishEnabled = await this.page
      .locator("button")
      .filter({ hasText: /^Publish Journey$/i })
      .last()
      .isEnabled()
      .catch(() => false);
    return !stillNeedsSelection || publishEnabled;
  }

  private async verifyPublishedJourneyFromListing(journeyName: string) {
    const listingSearch = this.page.getByRole("textbox", { name: /Search by Journey Name/i }).first();
    if (!await listingSearch.isVisible({ timeout: 15000 }).catch(() => false)) {
      await this.openJourneyListing();
    }

    await expect(listingSearch).toBeVisible({ timeout: 60000 });
    await fillWithFallback(listingSearch, journeyName);

    const listedJourney = this.page.getByText(new RegExp(`^${this.escapeRegex(journeyName)}$`, "i")).first();
    await expect(listedJourney).toBeVisible({ timeout: 60000 });
    await listedJourney.click({ force: true });

    await this.openJourneyListingMetrics();
    await expect(this.page.getByText(/Journey Started/i).first()).toBeVisible({ timeout: 30000 });
    await expect(this.page.getByText(/Engaged\s*i/i).first()).toBeVisible({ timeout: 30000 });
    await expect(this.page.getByText(/Converted\s*i/i).first()).toBeVisible({ timeout: 30000 });
  }

  private async openJourneyListing() {
    await tryClickFirstVisible([
      this.page.getByRole("img", { name: /back icon/i }).first(),
      this.page.getByRole("button", { name: /back/i }).first(),
      this.page.locator('img[alt*="back" i]').first(),
    ], { force: true });
  }

  private async openJourneyListingMetrics() {
    const journeyStarted = this.page.getByText(/Journey Started/i).first();
    if (await journeyStarted.isVisible({ timeout: 3000 }).catch(() => false)) {
      return;
    }

    for (const candidate of [
      this.page.locator("tbody tr").first().locator("svg").first(),
      this.page.locator("table tbody tr").first().locator("td").first(),
      this.page.locator("svg").nth(3),
    ]) {
      if (!await candidate.isVisible().catch(() => false)) {
        continue;
      }
      await candidate.click({ force: true }).catch(() => {});
      if (await journeyStarted.isVisible({ timeout: 5000 }).catch(() => false)) {
        return;
      }
    }
  }

  private async selectFirstVisibleOption(candidates: Array<ReturnType<Page["locator"]>>) {
    for (const candidate of candidates) {
      if (!await candidate.isVisible({ timeout: 5000 }).catch(() => false)) {
        continue;
      }
      await candidate.click({ force: true });
      return true;
    }

    return false;
  }

  private async clickFirstVisibleCandidate(candidates: Array<ReturnType<Page["locator"]>>) {
    for (const candidate of candidates) {
      if (!await candidate.isVisible({ timeout: 5000 }).catch(() => false)) {
        continue;
      }
      await candidate.scrollIntoViewIfNeeded().catch(() => {});
      await candidate.click({ force: true });
      await this.page.waitForTimeout(500);
      return true;
    }

    return false;
  }

  private async selectDropdownOption(triggerName: RegExp, optionName: RegExp) {
    const trigger = this.page.getByRole("button", { name: triggerName }).first();
    await expect(trigger).toBeVisible({ timeout: 30000 });
    await trigger.click({ force: true });

    await this.clickDropdownOption(optionName);
    await this.page.keyboard.press("Escape").catch(() => {});
  }

  private async clickDropdownOption(optionName: RegExp) {
    const option = this.page.locator("button, [role='button']").filter({ hasText: optionName }).last();
    if (await option.isVisible({ timeout: 5000 }).catch(() => false)) {
      await option.click({ force: true });
    } else {
      const textOption = this.page.getByText(optionName).last();
      await expect(textOption).toBeVisible({ timeout: 30000 });
      await textOption.click({ force: true });
    }
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private channelCardPattern(channel: Extract<OneTimeCampaignChannel, "SMS" | "WhatsApp" | "AI Calling">) {
    if (channel === "WhatsApp") {
      return /^WhatsApp\s*Nurture leads with personalized messages on WhatsApp\.$/i;
    }

    if (channel === "AI Calling") {
      return /^AI Agent Calling\s*Intelligent voice calls powered by AI$/i;
    }

    return /^SMS\s*Drive action with short, urgent messages$/i;
  }

  private channelNodePattern(channel: Extract<OneTimeCampaignChannel, "SMS" | "WhatsApp" | "AI Calling">) {
    if (channel === "WhatsApp") {
      return /WhatsApp|Nurture leads/i;
    }

    if (channel === "AI Calling") {
      return /AI Agent Calling|AI Calling|Intelligent voice/i;
    }

    return /SMSDrive action|Drive action with short, urgent messages|SMS/i;
  }
}
