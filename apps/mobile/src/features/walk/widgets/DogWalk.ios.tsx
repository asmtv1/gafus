import { HStack, Link, Text, VStack } from "@expo/ui/swift-ui";
import { background, font, foregroundStyle, padding } from "@expo/ui/swift-ui/modifiers";
import { createWidget } from "expo-widgets";

import type { WalkWidgetSnapshot } from "../walkWidgetSnapshot";

/** Single WidgetKit widget, with link actions reliable even if GAFUS was closed. */
const DogWalkWidgetView = (props: WalkWidgetSnapshot) => {
  "widget";
  return (
    <VStack spacing={7} modifiers={[background("#F6F6E9"), padding({ all: 12 })]}>
      <HStack spacing={8}>
        <Text modifiers={[font({ size: 13, weight: "semibold" }), foregroundStyle("#5B6644")]}>
          🐕 Прогулка
        </Text>
        <Text modifiers={[font({ size: 10 }), foregroundStyle("#5B6644")]}>
          {props.mode === "countdown" ? "Обратный отсчёт" : "Секундомер"}
        </Text>
      </HStack>
      {props.active && props.running ? (
        <Text
          timerInterval={
            props.mode === "countdown"
              ? { lower: new Date(props.displayStartMs), upper: new Date(props.displayEndMs) }
              : {
                  lower: new Date(props.displayStartMs),
                  upper: new Date(props.displayStartMs + 86400000),
                }
          }
          countsDown={props.mode === "countdown"}
          modifiers={[font({ size: 25, weight: "bold" }), foregroundStyle("#1E271A")]}
        />
      ) : (
        <Text modifiers={[font({ size: 25, weight: "bold" }), foregroundStyle("#1E271A")]}>
          {props.elapsedLabel}
        </Text>
      )}
      <Text modifiers={[font({ size: 14, weight: "medium" }), foregroundStyle("#1E271A")]}>
        🐾 {props.stepsLabel} шагов · ≈ {props.metersLabel}
      </Text>
      <HStack spacing={14}>
        <Link
          label={props.active && !props.running ? "▶ Продолжить" : "▶ Старт"}
          destination="gafus://walk?action=start"
          modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle("#3C653B")]}
        />
        <Link
          label="Ⅱ Пауза"
          destination="gafus://walk?action=pause"
          modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle("#8C6E25")]}
        />
        <Link
          label="■ Конец"
          destination="gafus://walk?action=finish"
          modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle("#B74A39")]}
        />
      </HStack>
      {props.incomplete ? (
        <Text modifiers={[font({ size: 10 }), foregroundStyle("#8B6D34")]}>
          Данные о шагах неполные
        </Text>
      ) : null}
    </VStack>
  );
};

export default createWidget<WalkWidgetSnapshot>("DogWalk", DogWalkWidgetView);
