import { BaseTool } from '../tools/base-tool';
import { AgentContext } from '../domain/agent-context.interface';

export abstract class BaseAgent {
  abstract readonly name: string;
  abstract readonly description: string;
  
  protected tools: Map<string, BaseTool<any, any>> = new Map();

  constructor(tools: BaseTool<any, any>[]) {
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }

  getTools(): BaseTool<any, any>[] {
    return Array.from(this.tools.values());
  }

  getTool(name: string): BaseTool<any, any> | undefined {
    return this.tools.get(name);
  }

  // The executeTask method would connect to LLM (e.g. Gemini 3.1 Pro)
  // For now we mock the interface where the agent orchestrates tool usage
  abstract executeTask(prompt: string, context: AgentContext): Promise<string>;
}
