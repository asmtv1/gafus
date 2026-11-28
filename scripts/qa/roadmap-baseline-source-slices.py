#!/usr/bin/env python3
"""Extract historical read functions, not an old full application build."""
import pathlib
import subprocess
SHA = "b9bfc537f18610afe81016440ed9cd33dacc3229"
ROOT = pathlib.Path(__file__).resolve().parents[2]
out = ROOT / "apps/api/scripts/qa"
def old(path):
    return subprocess.check_output(["git", "-C", str(ROOT), "show", f"{SHA}:{path}"], text=True)
def section(source, start, end):
    a=source.index(start)
    return source[a:source.index(end,a)]
def write(name, body):
    p=out/name
    if p.exists(): raise RuntimeError(f"refusing to overwrite {p}")
    p.write_text(body)
    print(p)
chat=old("apps/api/src/modules/chat2/service.ts")
course=old("packages/core/src/services/course/courseService.ts")
policy=old("packages/core/src/services/contentAccess/policy.ts").replace('from "../appFeatureFlags"', 'from "@gafus/feature-flags-server"')
walk=old("packages/tracking-server/src/walksService.ts")
write("roadmap-historical-catalog.generated.ts", old("packages/course-read-server/src/legacyCatalogRows.ts"))
write("roadmap-historical-slices.generated.ts", '''// Generated historical source, using current runtime dependencies.
import { prisma } from "@gafus/prisma";
import { TrainingStatus, type CourseWithProgressData } from "@gafus/types";
import * as oldRows from "./roadmap-historical-catalog.generated.js";
import * as policyReads from "@gafus/entitlements-server/policy-reads";
const requireCatalogReadPort = () => oldRows;
const chat2SignedPrivateMedia = async (key: string, ttl: number) => {
  if (ttl !== 60) throw Error("SIGN_TTL");
  return "https://qa.invalid/" + encodeURIComponent(key);
};
''' + policy + '\nregisterContentPolicyReadPort(policyReads);\n' +
section(course,"export async function getCoursesWithProgress(","// ========== Get Course Metadata") +
section(chat,"const roomAvatarCache","async function groupAvatarActor")+
section(chat,"export async function accessibleCourseRooms(","/** Course rooms use")+
section(chat,"export async function discover(","export async function joinGroup(")+
section(walk,"export interface CompletedDogWalkInput","export interface DogWalkTrackInput"))
