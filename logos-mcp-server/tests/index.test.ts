import { beforeEach, describe, expect, it, vi } from "vitest";

const searchCatalogMock = vi.hoisted(() => vi.fn(() => [{ resourceId: "LLS:COMM", title: "Romans Commentary", abbreviatedTitle: "Rom Comm", type: "text.monograph.commentary.bible", authors: "John Murray", subjects: "Romans", description: "Classic", publicationDate: "1959" }]));

const mcpState = vi.hoisted(() => ({
  instances: [] as Array<{ tools: Array<{ name: string; description: string; schema: unknown; handler: (args: Record<string, unknown>) => Promise<unknown> }> }>,
}));

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class FakeMcpServer {
    tools: Array<{ name: string; description: string; schema: unknown; handler: (args: Record<string, unknown>) => Promise<unknown> }> = [];

    constructor(_info: unknown) {
      mcpState.instances.push(this);
    }

    tool(name: string, description: string, schema: unknown, handler: (args: Record<string, unknown>) => Promise<unknown>) {
      this.tools.push({ name, description, schema, handler });
    }

    async connect(_transport: unknown) {
      return undefined;
    }
  },
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class FakeTransport {},
}));

vi.mock("../src/config.js", () => ({
  SERVER_NAME: "logos-bible",
  SERVER_VERSION: "1.0.0",
}));

vi.mock("../src/services/biblia-api.js", () => ({
  getBibleText: vi.fn(async (passage: string, bible?: string) => ({
    passage,
    bible: bible ?? "LEB",
    text: "Sample passage text",
  })),
  searchBible: vi.fn(async (query: string) => ({
    query,
    resultCount: 1,
    results: [{ title: "Romans 8:28", preview: "All things work together..." }],
  })),
  scanReferences: vi.fn(async () => [{ passage: "John 3:16" }]),
  comparePassages: vi.fn(async () => ({
    equal: false,
    intersects: true,
    subset: false,
    superset: false,
    before: false,
    after: false,
  })),
  getAvailableBibles: vi.fn(async () => [{
    bible: "LEB",
    title: "Lexham English Bible",
    abbreviatedTitle: "LEB",
    languages: ["en"],
    publishers: ["Lexham"],
  }]),
}));

vi.mock("../src/services/logos-app.js", () => ({
  navigateToPassage: vi.fn(async () => ({ success: true, command: "logos4:///Bible/Jn3.16" })),
  openWordStudy: vi.fn(async () => ({ success: true, command: "logos4:///WordStudy?word=grace" })),
  openFactbook: vi.fn(async () => ({ success: true, command: "logos4:///Factbook?ref=Moses" })),
  openResource: vi.fn(async () => ({ success: true, command: "logosres:LLS:COMM" })),
  openGuide: vi.fn(async () => ({ success: true, command: "logos4:///Guide" })),
  searchAll: vi.fn(async () => ({ success: false, command: "logos4:///Search", error: "Logos not running" })),
}));

vi.mock("../src/services/reference-parser.js", () => ({
  expandRange: vi.fn(() => "John 3:11-21"),
}));

vi.mock("../src/services/sqlite-reader.js", () => ({
  getUserHighlights: vi.fn(() => [{ resourceId: "LLS:ROM", textRange: "Ro 8:28", styleName: "Solid Colors", syncDate: "2026-03-20" }]),
  getFavorites: vi.fn(() => [{ id: "fav-1", title: "Romans", appCommand: "logos4:///Bible/Ro8.28", resourceId: "LLS:ROM", rank: 1 }]),
  getWorkflowTemplates: vi.fn(() => [{ templateId: 1, externalId: "inductive", title: "Inductive Study", author: "Logos", templateJson: null, createdDate: "2026-01-01" }]),
  getWorkflowInstances: vi.fn(() => [{ instanceId: 1, externalId: "inst-1", templateId: "1", key: "romans", title: "Romans", currentStep: "Observe", completedSteps: ["Read"], skippedSteps: [], createdDate: "2026-03-01", completedDate: null, modifiedDate: "2026-03-20" }]),
  getReadingProgress: vi.fn(() => ({ statuses: [{ title: "Read Romans", author: "Paul", path: "/romans", status: 1, modifiedDate: "2026-03-20" }], items: [], totalItems: 4, completedItems: 2, percentComplete: 50 })),
  getUserNotes: vi.fn(() => [{ noteId: 1, externalId: "note-1", content: "Grace alone", createdDate: "2026-03-01", modifiedDate: "2026-03-20", notebookTitle: "Romans", anchorsJson: "[]", tagsJson: "[]" }]),
}));

vi.mock("../src/services/catalog-reader.js", () => ({
  searchCatalog: searchCatalogMock,
  getResourceTypeSummary: vi.fn(() => [{ label: "Commentary", count: 12 }]),
  typeLabel: vi.fn(() => "Commentary"),
}));

function getRegisteredTool(name: string) {
  const instance = mcpState.instances.at(-1);
  if (!instance) {
    throw new Error("No MCP server instance was created");
  }

  const tool = instance.tools.find((entry) => entry.name === name);
  if (!tool) {
    throw new Error(`Tool ${name} not registered`);
  }

  return tool;
}

describe("index MCP registration", () => {
  beforeEach(() => {
    vi.resetModules();
    mcpState.instances.length = 0;
    searchCatalogMock.mockClear();
  });

  it("registers the full tool surface", async () => {
    const indexModule = await import("../src/index.js");

    indexModule.createServer();

    const instance = mcpState.instances.at(-1);
    expect(instance?.tools).toHaveLength(22);
    expect(instance?.tools.map((tool) => tool.name)).toContain("navigate_passage");
    expect(instance?.tools.map((tool) => tool.name)).toContain("get_resource_types");
  });

  it("formats get_bible_text responses through the MCP entrypoint", async () => {
    const indexModule = await import("../src/index.js");

    indexModule.createServer();
    const tool = getRegisteredTool("get_bible_text");
    const result = await tool.handler({ passage: "John 3:16" });

    expect(result).toEqual({
      content: [{ type: "text", text: "**John 3:16** (LEB)\n\nSample passage text" }],
    });
  });

  it("formats successful Logos navigation responses", async () => {
    const indexModule = await import("../src/index.js");

    indexModule.createServer();
    const tool = getRegisteredTool("navigate_passage");
    const result = await tool.handler({ reference: "John 3:16" });

    expect(result).toEqual({
      content: [{ type: "text", text: "Opened John 3:16 in Logos." }],
    });
  });

  it("formats library catalog responses and resource labels", async () => {
    const indexModule = await import("../src/index.js");

    indexModule.createServer();
    const tool = getRegisteredTool("get_library_catalog");
    const result = await tool.handler({ type: "commentary" });

    expect(result).toEqual({
      content: [{
        type: "text",
        text: "Found 1 resources:\n\n- **Romans Commentary** — John Murray\n  ID: `LLS:COMM` | Type: Commentary",
      }],
    });
  });

  it("rejects get_library_catalog calls with no filters", async () => {
    const indexModule = await import("../src/index.js");

    indexModule.createServer();
    const tool = getRegisteredTool("get_library_catalog");
    const result = await tool.handler({ limit: 50 });

    expect(result).toEqual({
      content: [{
        type: "text",
        text: "get_library_catalog requires at least one non-empty filter: query, type, or author.",
      }],
      isError: true,
    });
    expect(searchCatalogMock).not.toHaveBeenCalled();
  });

  it("rejects get_library_catalog calls with only blank-string filters", async () => {
    const indexModule = await import("../src/index.js");

    indexModule.createServer();
    const tool = getRegisteredTool("get_library_catalog");
    const result = await tool.handler({ query: "   ", type: "", author: "  " });

    expect(result).toEqual({
      content: [{
        type: "text",
        text: "get_library_catalog requires at least one non-empty filter: query, type, or author.",
      }],
      isError: true,
    });
    expect(searchCatalogMock).not.toHaveBeenCalled();
  });

  it("formats tool errors through the MCP entrypoint", async () => {
    const indexModule = await import("../src/index.js");

    indexModule.createServer();
    const tool = getRegisteredTool("search_all");
    const result = await tool.handler({ query: "grace" });

    expect(result).toEqual({
      content: [{ type: "text", text: "Failed to open search: Logos not running" }],
      isError: true,
    });
  });

  it("formats resource type summaries", async () => {
    const indexModule = await import("../src/index.js");

    indexModule.createServer();
    const tool = getRegisteredTool("get_resource_types");
    const result = await tool.handler({});

    expect(result).toEqual({
      content: [{ type: "text", text: "Library contains 12 resources across 1 types:\n\n- **Commentary**: 12" }],
    });
  });
});