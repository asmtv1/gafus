import {
  FlexWidget,
  TextWidget,
  requestWidgetUpdate,
  type WidgetTaskHandlerProps,
} from "react-native-android-widget";
import type { WalkWidgetSnapshot } from "../walkWidgetSnapshot";
import { loadWalkWidgetSnapshot } from "../walkWidgetSnapshot";

function WalkControl({
  label,
  action,
  color,
}: {
  label: string;
  action: string;
  color: `#${string}`;
}) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: `gafus://walk?action=${action}` }}
      style={{ backgroundColor: "#E3E9D8", borderRadius: 10, padding: 8 }}
    >
      <TextWidget text={label} style={{ fontSize: 13, fontWeight: "bold", color }} />
    </FlexWidget>
  );
}

export function renderAndroidWalkWidget(_name: string, snapshot: WalkWidgetSnapshot) {
  return (
    <FlexWidget
      style={{
        flexDirection: "column",
        backgroundColor: "#F6F6E9",
        padding: 14,
        borderRadius: 18,
        flexGap: 5,
      }}
    >
      {/* Hidden metadata consumed by the patched Android RemoteViews renderer.
          No background JS interval is needed for the native Chronometer. */}
      <TextWidget
        text={`gafus-clock|${snapshot.active ? 1 : 0}|${snapshot.running ? 1 : 0}|${snapshot.mode}|${snapshot.displayStartMs}|${snapshot.displayEndMs}`}
        style={{ fontSize: 1, color: "#00000000" }}
      />
      <TextWidget
        text={`🐕 Прогулка · ${snapshot.mode === "countdown" ? "обратный" : "обычный"}`}
        style={{ fontSize: 14, color: "#5B6644" }}
      />
      {/* Native Android Chronometer covers this placeholder and ticks on its own. */}
      <TextWidget text=" " style={{ fontSize: 26, fontWeight: "bold", color: "#1E271A" }} />
      <TextWidget
        text={`🐾 ${snapshot.stepsLabel} шагов  ·  ≈ ${snapshot.metersLabel}`}
        style={{ fontSize: 13, color: "#1E271A" }}
      />
      <FlexWidget style={{ flexDirection: "row", flexGap: 7 }}>
        <WalkControl
          label={snapshot.active && !snapshot.running ? "▶ Продолжить" : "▶ Старт"}
          action="start"
          color="#3C653B"
        />
        <WalkControl label="Ⅱ Пауза" action="pause" color="#8C6E25" />
        <WalkControl label="■ Конец" action="finish" color="#B74A39" />
      </FlexWidget>
      {snapshot.incomplete ? (
        <TextWidget text="Шаги могут быть неполными" style={{ fontSize: 10, color: "#8B6D34" }} />
      ) : null}
    </FlexWidget>
  );
}

export async function androidWalkWidgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetAction === "WIDGET_DELETED") return;
  const snapshot = await loadWalkWidgetSnapshot();
  props.renderWidget(renderAndroidWalkWidget(props.widgetInfo.widgetName, snapshot));
}

export async function updateAndroidWalkWidgets(snapshot: WalkWidgetSnapshot): Promise<void> {
  await requestWidgetUpdate({
    widgetName: "DogWalk",
    renderWidget: () => renderAndroidWalkWidget("DogWalk", snapshot),
  });
}
