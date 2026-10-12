import React from "react";
import { createRoot } from "react-dom/client";
import { CdnImage } from "../../apps/web/src/shared/components/media/CdnImage";
import { FeedVideo } from "../../apps/web/src/features/feed/FeedVideo";
import { feedApi } from "../../apps/web/src/features/feed/api";
declare global { interface Window { __STAGE_FIXTURE__: any; __TEST_TRACKING__: any; } }
const f=window.__STAGE_FIXTURE__;
window.__TEST_TRACKING__={fallbackCalls:0,imageErrors:0,mode:f.mode};
function App() {
 if(f.mode==="video") return <div><h2>GAFUS FeedVideo production component</h2>
  <div id="video-root" style={{width:550,height:360,position:"relative"}}>
    <FeedVideo mediaId={f.mediaId} poster={null}/>
  </div></div>;
 return <div><h2>GAFUS CdnImage production component</h2>
  <CdnImage source={f.cdnUrl} id="stage-image" alt="GAFUS staging test image"
   style={{width:320,height:220,objectFit:"contain"}}
   requestFallback={async()=>{ window.__TEST_TRACKING__.fallbackCalls++;
     return feedApi.requestMediaFallback(f.mediaId,"full"); }}
   onError={()=>{window.__TEST_TRACKING__.imageErrors++;}}/>
 </div>;
}
createRoot(document.getElementById("root")!).render(<App/>);
