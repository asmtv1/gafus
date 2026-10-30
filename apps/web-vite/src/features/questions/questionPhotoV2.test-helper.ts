/** Test-only Hono reservation -> direct S3 form POST -> Hono confirm fixture. */
import { vi } from "vitest";

export function photoV2Reservation(id: string) {
  return new Response(JSON.stringify({success:true,data:{id,upload:{
    method:"POST",url:"https://isolated-s3.example/questions/test",
    fields:{key:`questions/v2/${id}/source.jpg`},
  }}}),{status:201});
}
export function photoV2Confirmation(id: string) {
  return new Response(JSON.stringify({success:true,data:{id,status:"QUEUED"}}),{status:200});
}
export function installQuestionPhotoV2Browser(preview: string) {
  const originalURL = URL;
  const uploads: { method: string; url: string; form?: FormData; withCredentials: boolean }[] = [];
  class FakeURL extends originalURL {
    static createObjectURL = vi.fn(() => preview);
    static revokeObjectURL = vi.fn();
  }
  class FakeXHR {
    status = 204;
    withCredentials = false;
    upload: { onprogress?: ((event: ProgressEvent) => void) | null } = {};
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    private call?: (typeof uploads)[number];
    open(method: string, url: string) {
      this.call = {method,url,withCredentials:this.withCredentials};
      uploads.push(this.call);
    }
    send(form: FormData) {
      if (this.call) {
        this.call.form=form;
        this.call.withCredentials=this.withCredentials;
      }
      queueMicrotask(() => this.onload?.());
    }
    abort() { this.onabort?.(); }
  }
  vi.stubGlobal("URL",FakeURL);
  vi.stubGlobal("XMLHttpRequest",FakeXHR);
  return uploads;
}
