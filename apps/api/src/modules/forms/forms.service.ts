import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Injectable, NotFoundException } from "@nestjs/common";
import { type FormSchema, migrate } from "@org/form-schema";
import { dataFile, ensureDataDir } from "../../common/file-store.js";

/**
 * File-backed store. The server is the source of truth: every saved body is run
 * through `migrate` (which validates via formSchema.parse and throws on invalid),
 * so only normalized, current-version JSON ever lands on disk.
 */
@Injectable()
export class FormsService {
  private fileFor(id: string): string {
    return dataFile(id, ".json", "form");
  }

  save(body: unknown): FormSchema {
    const form = migrate(body); // validates + normalizes to CURRENT_FORM_VERSION
    ensureDataDir();
    writeFileSync(this.fileFor(form.id), JSON.stringify(form, null, 2), "utf8");
    return form;
  }

  load(id: string): FormSchema {
    const file = this.fileFor(id);
    if (!existsSync(file)) throw new NotFoundException(`Form not found: ${id}`);
    return JSON.parse(readFileSync(file, "utf8")) as FormSchema;
  }
}
