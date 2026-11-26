import { MessageTemplate } from "@/shared/types";

export interface TemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  text?: string;
  example?: any;
  buttons?: Array<{
    type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
    text: string;
    url?: string;
    phone_number?: string;
  }>;
}

export class TemplateRepository {
  private static inMemory: MessageTemplate[] = [];

  static resetMemory() {
    TemplateRepository.inMemory = [];
  }

  async findAll(wabaId?: string): Promise<MessageTemplate[]> {
    if (wabaId) {
      const match = TemplateRepository.inMemory.filter((t) => t.wabaId === wabaId);
      if (match.length > 0) return match;
    }
    return TemplateRepository.inMemory;
  }

  async findById(templateId: string): Promise<MessageTemplate | null> {
    return TemplateRepository.inMemory.find((t) => t.templateId === templateId) || null;
  }

  async findByName(name: string): Promise<MessageTemplate | null> {
    return TemplateRepository.inMemory.find((t) => t.name.toLowerCase() === name.toLowerCase()) || null;
  }

  async create(template: MessageTemplate): Promise<MessageTemplate> {
    const existingIdx = TemplateRepository.inMemory.findIndex((t) => t.name === template.name);
    if (existingIdx !== -1) {
      TemplateRepository.inMemory[existingIdx] = template;
    } else {
      TemplateRepository.inMemory.unshift(template);
    }
    return template;
  }

  async delete(nameOrId: string): Promise<boolean> {
    const initialLen = TemplateRepository.inMemory.length;
    TemplateRepository.inMemory = TemplateRepository.inMemory.filter(
      (t) => t.templateId !== nameOrId && t.name.toLowerCase() !== nameOrId.toLowerCase()
    );
    return TemplateRepository.inMemory.length < initialLen;
  }
}
