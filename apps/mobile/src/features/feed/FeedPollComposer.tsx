import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import type { FeedPickedMedia } from "./uploads";
import { type FeedPollEditorDraft, validateFeedPollDraft } from "@gafus/types";
export type MobileFeedPollDraft = FeedPollEditorDraft<FeedPickedMedia>;
import { Button } from "@/shared/components";
import { COLORS, FONTS } from "@/shared/config";

export const emptyMobileFeedPoll = (): MobileFeedPollDraft => ({
  question: "", options: [{ text: "" }, { text: "" }],
  isQuiz: false, allowMultiple: false, isAnonymous: false,
  hideResults: false, shuffleOptions: false, endDate: null,
});

export function FeedPollComposer({ value, onChange, onPickImage, onRemoveImage, disabled }: {
  value: MobileFeedPollDraft | null;
  onChange: (value: MobileFeedPollDraft | null) => void;
  onPickImage?: (optionIndex: number) => void;
  onRemoveImage?: (optionIndex: number) => void;
  disabled?: boolean;
}) {
  if (!value) return <Button variant="secondary" label="+ Добавить опрос"
    disabled={disabled} onPress={() => onChange(emptyMobileFeedPoll())} />;
  const update = (partial: Partial<MobileFeedPollDraft>) => onChange({ ...value, ...partial });
  const optionChange = (index: number, patch: Partial<MobileFeedPollDraft["options"][number]>) =>
    update({ options: value.options.map((row, i) => i === index ? { ...row, ...patch } : row) });
  const issue = validateFeedPollDraft(value);
  const endDays = value.endDate ? Math.max(0, Math.round((new Date(value.endDate).getTime() - Date.now()) / 86400000)) : 0;
  return <View style={s.card} accessibilityLabel="Редактор опроса">
    <View style={s.header}>
      <Text style={s.heading}>Опрос</Text>
      <Pressable accessibilityRole="button" disabled={disabled} onPress={() => onChange(null)}>
        <Text style={s.remove}>Убрать</Text>
      </Pressable>
    </View>
    <Text style={s.label}>Вопрос</Text>
    <TextInput style={s.input} maxLength={500} placeholder="Что вы думаете?"
      placeholderTextColor={COLORS.textSecondary} editable={!disabled} value={value.question}
      onChangeText={question => update({ question })} />
    {value.options.map((option, index) => <View key={index} style={s.optionGroup}>
      <View style={s.option}>
      {value.isQuiz && <Pressable accessibilityRole={value.allowMultiple ? "checkbox" : "radio"}
        accessibilityState={{ checked: !!option.isCorrect }} disabled={disabled}
        accessibilityLabel={`Правильный вариант ${index + 1}`} style={s.correct}
        onPress={() => update({ options: value.options.map((row, i) => ({ ...row,
          isCorrect: value.allowMultiple ? (i === index ? !row.isCorrect : !!row.isCorrect) : i === index,
        })) })}>
        <Text style={s.correctText}>{option.isCorrect ? "✓" : "○"}</Text>
      </Pressable>}
      <TextInput style={[s.input, s.optionInput]} value={option.text} maxLength={200}
        editable={!disabled} placeholder={`Вариант ${index + 1}`} placeholderTextColor={COLORS.textSecondary}
        onChangeText={text => optionChange(index, { text })} />
      {onPickImage && <Pressable accessibilityRole="button" disabled={disabled}
        accessibilityLabel={`Фото варианта ${index + 1}`}
        onPress={() => onPickImage(index)} style={s.photoButton}>
        <Text style={s.photoButtonLabel}>{option.imageAsset ? "Заменить" : "+ Фото"}</Text>
      </Pressable>}
      {value.options.length > 2 && <Pressable accessibilityRole="button" disabled={disabled}
        accessibilityLabel={`Удалить вариант ${index + 1}`}
        onPress={() => { onRemoveImage?.(index); update({ options: value.options.filter((_, i) => i !== index) }); }}
        style={s.correct}><Text style={s.remove}>×</Text></Pressable>}
      </View>
      {option.imageAsset && <View style={s.imageRow}>
        <Image source={{ uri: option.imageAsset.uri }} style={s.imagePreview} contentFit="cover" />
        <Pressable accessibilityRole="button" disabled={disabled}
          accessibilityLabel={`Убрать фото варианта ${index + 1}`}
          onPress={() => onRemoveImage?.(index)} style={s.correct}>
          <Text style={s.remove}>×</Text>
        </Pressable>
      </View>}
    </View>)}
    {value.options.length < 10 && <Button label="+ Ещё вариант" variant="secondary" disabled={disabled}
      onPress={() => update({ options: [...value.options, { text: "" }] })} />}
    {([
      ["allowMultiple", "Несколько вариантов"],
      ["isQuiz", "Викторина"],
      ["isAnonymous", "Анонимно"],
      ["hideResults", "Скрывать результаты до завершения"],
      ["shuffleOptions", "Перемешивать варианты"],
    ] as const).map(([key, label]) => <View key={key} style={s.setting}>
      <Text style={s.settingLabel}>{label}</Text>
      <Switch value={!!value[key]} disabled={disabled} trackColor={{ true: "#9AA987", false: "#ddd" }}
        thumbColor="#fff" onValueChange={checked => update({ [key]: checked,
          ...(key === "isQuiz" && !checked ? { options: value.options.map(row => ({ ...row, isCorrect: false })) } : {}),
          ...(key === "allowMultiple" && !checked ? { options: value.options.map((row, i) => ({ ...row,
            isCorrect: i === value.options.findIndex(option => option.isCorrect) })) } : {}),
        })} />
    </View>)}
    <Text style={s.label}>Окончание опроса</Text>
    <View style={s.days}>
      {([0, 1, 3, 7] as const).map(days => <Pressable key={days} disabled={disabled}
        accessibilityRole="radio" accessibilityState={{ checked: endDays === days }}
        style={[s.chip, endDays === days && s.chipActive]}
        onPress={() => update({ endDate: days ? new Date(Date.now() + days * 86400000).toISOString() : null })}>
        <Text style={s.chipText}>{days === 0 ? "Без срока" : `${days} дн.`}</Text>
      </Pressable>)}
    </View>
    {value.isQuiz && <>
      <Text style={s.label}>Пояснение после голосования</Text>
      <TextInput multiline style={[s.input, s.multiline]} editable={!disabled}
        maxLength={2000} value={value.explanation ?? ""} onChangeText={explanation => update({ explanation })}
        placeholder="Почему этот ответ правильный?" placeholderTextColor={COLORS.textSecondary} />
    </>}
    {issue && <Text style={s.issue}>{issue}</Text>}
  </View>;
}
const s = StyleSheet.create({
  card: { borderRadius: 16, padding: 14, gap: 10, backgroundColor: "#F5F7EF", borderWidth: 1, borderColor: "#DDE4D5" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { fontFamily: FONTS.montserratBold, fontSize: 15, color: COLORS.text },
  label: { fontFamily: FONTS.montserratMedium, fontSize: 12, color: COLORS.textSecondary },
  input: { backgroundColor: "#FFFEFB", borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: 10,
    minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, fontFamily: FONTS.montserrat, color: COLORS.text, fontSize: 13 },
  optionGroup: { gap: 7 },
  option: { flexDirection: "row", alignItems: "center", gap: 8 },
  optionInput: { flex: 1, minWidth: 0 },
  photoButton: { minHeight: 38, paddingHorizontal: 9, justifyContent: "center", borderRadius: 9, borderWidth: 1,
    borderColor: "#CCD5C1", backgroundColor: "#FFFEFB" },
  photoButtonLabel: { color: COLORS.primary, fontFamily: FONTS.montserratMedium, fontSize: 11 },
  imageRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  imagePreview: { width: 70, height: 58, borderRadius: 9, backgroundColor: "#E6EADA" },
  correct: { width: 35, height: 40, alignItems: "center", justifyContent: "center" },
  correctText: { color: COLORS.primary, fontSize: 21 },
  remove: { color: "#986049", fontFamily: FONTS.montserratMedium, fontSize: 13 },
  setting: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 42 },
  settingLabel: { flex: 1, fontFamily: FONTS.montserrat, fontSize: 13, color: COLORS.text },
  days: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { borderRadius: 20, paddingVertical: 9, paddingHorizontal: 13, backgroundColor: "#fff", borderWidth: 1, borderColor: "#D6DECD" },
  chipActive: { backgroundColor: "#E2EBCD", borderColor: COLORS.primary },
  chipText: { fontFamily: FONTS.montserratMedium, color: COLORS.primary, fontSize: 12 },
  multiline: { minHeight: 76, textAlignVertical: "top" },
  issue: { color: "#9B5736", fontFamily: FONTS.montserrat, fontSize: 12 },
});
