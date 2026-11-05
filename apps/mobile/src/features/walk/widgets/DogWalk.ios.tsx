import { HStack, Button, Text, VStack } from "@expo/ui/swift-ui";
import { background, font, foregroundStyle, padding } from "@expo/ui/swift-ui/modifiers";
import { createWidget } from "expo-widgets";

import type { WalkWidgetSnapshot } from "../walkWidgetSnapshot";

/** Real WidgetKit buttons persist commands in App Group; RN executes when its authenticated host process is available. */
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
        🐾 {props.stepsLabel} шагов · {props.metersLabel}
      </Text>
      <HStack spacing={14}>
        <Button
          label={props.active && !props.running ? "▶ Продолжить" : "▶ Старт"}
          target="walk:start"
          modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle("#3C653B")]}
        />
        <Button
          label="Ⅱ Пауза"
          target="walk:pause"
          modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle("#8C6E25")]}
        />
        <Button
          label="■ Конец"
          target="walk:finish"
          modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle("#B74A39")]}
        />
      </HStack>
      {props.active && props.running && !props.gpsEnabled ? (
        <Text modifiers={[font({ size: 10 }), foregroundStyle("#8B6D34")]}>
          GPS недоступен — проверьте разрешения в GAFUS
        </Text>
      ) : null}
      {props.incomplete ? (
        <Text modifiers={[font({ size: 10 }), foregroundStyle("#8B6D34")]}>
          Данные о шагах неполные
        </Text>
      ) : null}
    </VStack>
  );
};

export default createWidget<WalkWidgetSnapshot>("DogWalk", DogWalkWidgetView);
