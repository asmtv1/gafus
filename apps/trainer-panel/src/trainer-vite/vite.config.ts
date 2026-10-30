import {fileURLToPath} from "node:url";
export default {
 root:fileURLToPath(new URL(".",import.meta.url)),
 server:{host:"127.0.0.1",port:4178,strictPort:true},
 build:{outDir:fileURLToPath(new URL("./.opt-in-dist",import.meta.url)),emptyOutDir:true},
 appType:"spa" as const,
};
