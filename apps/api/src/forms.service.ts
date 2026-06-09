import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Injectable, NotFoundException } from "@nestjs/common";
import { type FormSchema, migrate } from "@org/form-schema";

/**
 * File-backed store. The server is the source of truth: every saved body is run
 * through `migrate` (which validates via formSchema.parse and throws on invalid),
 * so only normalized, current-version JSON ever lands on disk.
 */
@Injectable()
export class FormsService {
  private readonly dataDir = resolve(process.cwd(), ".data");

  private fileFor(id: string): string {
    // Guard against path traversal; ids are simple form identifiers.
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new NotFoundException(`Invalid form id: ${id}`);
    return resolve(this.dataDir, `${id}.json`);
  }

  save(body: unknown): FormSchema {
    const form = migrate(body); // validates + normalizes to CURRENT_FORM_VERSION
    if (!existsSync(this.dataDir)) mkdirSync(this.dataDir, { recursive: true });
    writeFileSync(this.fileFor(form.id), JSON.stringify(form, null, 2), "utf8");
    return form;
  }

  load(id: string): FormSchema {
    const file = this.fileFor(id);
    if (!existsSync(file)) throw new NotFoundException(`Form not found: ${id}`);
    return JSON.parse(readFileSync(file, "utf8")) as FormSchema;
  }
}
