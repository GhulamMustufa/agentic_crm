import { AgentContext } from '../domain/agent-context.interface';
import { BaseTool } from '../tools/base-tool';

export abstract class BaseAgent {
  abstract readonly name: string;
  abstract readonly description: string;

  protected tools: Map<string, BaseTool<unknown, unknown>> = new Map();

  constructor(tools: BaseTool<unknown, unknown>[] = []) {
    for (const tool of tools || []) {
      if (tool && tool.name) {
        this.tools.set(tool.name, tool);
      }
    }
  }

  getTools(): BaseTool<unknown, unknown>[] {
    return Array.from(this.tools.values());
  }

  getTool(name: string): BaseTool<unknown, unknown> | undefined {
    return this.tools.get(name);
  }

  // The executeTask method would connect to LLM (e.g. Gemini 3.1 Pro)
  // For now we mock the interface where the agent orchestrates tool usage
  abstract executeTask(prompt: string, context: AgentContext): Promise<string>;
}
