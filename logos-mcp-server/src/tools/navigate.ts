import { z } from "zod";
import { navigateToPassage, openWordStudy, openFactbook } from "../services/logos-app.js";
import type { ToolResult } from "../types.js";

export const navigatePassageTool = {
  name: "navigate_passage",
  description: "Open a Bible passage in the Logos Bible Software UI. Use standard Bible reference formats like 'Genesis 1:1' or 'Romans 8:28-30'. For non-Bible resources, use open_resource with get_resource_references instead.",
  inputSchema: {
    type: "object" as const,
    properties: {
      reference: { 
        type: "string", 
        description: "Bible reference to navigate to (e.g., 'Genesis 1:1', 'Romans 8:28-30')." 
      },
    },
    required: ["reference"],
  },
  async handler(args: Record<string, unknown>): Promise<ToolResult> {
    const { reference } = z.object({ reference: z.string() }).parse(args);
    const result = await navigateToPassage(reference);
    if (result.success) {
      return { content: [{ type: "text", text: `Opened ${reference} in Logos Bible Software.` }] };
    }
    return { content: [{ type: "text", text: `Failed to open passage: ${result.error}` }], isError: true };
  },
};

export const openWordStudyTool = {
  name: "open_word_study",
  description: "Open a word study in Logos Bible Software for a Greek, Hebrew, or English word.",
  inputSchema: {
    type: "object" as const,
    properties: {
      word: { type: "string", description: "The word to study (e.g., 'agape', 'hesed', 'justification')" },
    },
    required: ["word"],
  },
  async handler(args: Record<string, unknown>): Promise<ToolResult> {
    const { word } = z.object({ word: z.string() }).parse(args);
    const result = await openWordStudy(word);
    if (result.success) {
      return { content: [{ type: "text", text: `Opened word study for "${word}" in Logos.` }] };
    }
    return { content: [{ type: "text", text: `Failed to open word study: ${result.error}` }], isError: true };
  },
};

export const openFactbookTool = {
  name: "open_factbook",
  description: "Open the Logos Factbook for a person, place, event, or topic (e.g., 'Moses', 'Jerusalem', 'Passover').",
  inputSchema: {
    type: "object" as const,
    properties: {
      topic: { type: "string", description: "The topic to look up in Factbook" },
    },
    required: ["topic"],
  },
  async handler(args: Record<string, unknown>): Promise<ToolResult> {
    const { topic } = z.object({ topic: z.string() }).parse(args);
    const result = await openFactbook(topic);
    if (result.success) {
      return { content: [{ type: "text", text: `Opened Factbook entry for "${topic}" in Logos.` }] };
    }
    return { content: [{ type: "text", text: `Failed to open Factbook: ${result.error}` }], isError: true };
  },
};
