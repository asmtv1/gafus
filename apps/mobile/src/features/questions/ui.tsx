import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View, Linking, Alert, FlatList, Modal, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SwipeDismissMedia } from "@/shared/components/media/SwipeDismissMedia";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import { prepareUploadWebpVariants } from "@/shared/lib/media/prepareUploadWebp";
import type { PreparedQuestionPhotoVariants } from "@/shared/lib/api/questions";
import { COLORS, FONTS } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { uploadClientQuestionsPhoto, discardQuestionPhoto } from "@/shared/lib/api/questions";
import { classifyQuestionNativePhoto } from "./photoSource";
import { prepareUploadPhoto } from "@/shared/lib/media/prepareUploadPhoto";
import { iosCompatiblePhotoPicker } from "@/shared/lib/media/iosCompatiblePhotoPicker";
import { photoRetryMessage, photoFailureCode } from "@/shared/lib/media/photoRetryMessage";
import { PhotoUploadStageError, logPhotoUploadFailure, photoStageDiagnostic } from "@/shared/lib/media/photoUploadStage";
import { questionPhotoReadIdentity } from "./photoReadIdentity";
import { allowQuestionsS3Fallback } from "./questionPhotoCdnFallback";
import { questionPhotoTerminalNotice } from "./photoDisplay";
import { questionPhotoGridRows } from "./photoGrid";
import { reportClientError } from "@/shared/lib/tracer";
import { questionAuthorProfileIdentifier } from "./profileLink";
import {
  QUESTION_LIMITS,
  type QuestionAuthorDto,
  type QuestionListItemDto,
  type QuestionPhotoDto,
} from "@gafus/types";
export function QButton({
  label,
  onPress,
  disabled,
  secondary,
  selected,
  icon,
  compact = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  selected?: boolean;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      disabled={disabled}
      hitSlop={compact ? 4 : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        st.button,
        secondary && st.secondary,
        selected && st.selected,
        compact && st.compactButton,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      {icon && (
        <MaterialCommunityIcons
          name={icon}
          size={compact ? 16 : 20}
          color={secondary ? COLORS.primary : "#fff"}
        />
      )}
      <Text
        style={[
          st.buttonText,
          compact && st.compactButtonText,
          secondary && { color: COLORS.primary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function QAuthor({
  author,
  date,
  edited,
  compact = false,
  listStats,
}: {
  author: QuestionAuthorDto;
  date: string;
  edited?: string | null;
  compact?: boolean;
  listStats?: string;
}) {
  const router = useRouter();
  const viewer = useAuthStore((state) => state.user);
  const profileIdentifier = questionAuthorProfileIdentifier(author, viewer);
  const openProfile = () => {
    if (profileIdentifier) {
      router.push({ pathname: "/profile/[username]", params: { username: profileIdentifier } });
    }
  };
  const avatar = author.avatarUrl ? (
    <Image
      source={{ uri: author.avatarUrl }}
      style={[st.avatar, (compact || listStats !== undefined) && st.compactAvatar]}
      contentFit="cover"
    />
  ) : (
    <View style={[st.avatar, st.initial, (compact || listStats !== undefined) && st.compactAvatar]}>
      <Text style={st.label}>{author.name.slice(0, 1)}</Text>
    </View>
  );
  const nameAndDate = (
    <>
      <Text style={[st.label, compact && st.compactName]} numberOfLines={compact ? 1 : undefined}>
        {author.name}
      </Text>
      <Text style={[st.meta, compact && st.compactDate]}>
        {new Date(date).toLocaleDateString("ru-RU")}
        {edited && " · Изменено"}
      </Text>
    </>
  );
  // Question lists show author, date and activity in a compact two-line footer.
  if (listStats !== undefined) {
    return (
      <View style={st.listAuthor}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Открыть профиль ${author.name}`}
          disabled={!profileIdentifier}
          hitSlop={6}
          onPress={(event) => {
            event.stopPropagation();
            openProfile();
          }}
        >
          {avatar}
        </Pressable>
        <View style={st.listAuthorInfo}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Открыть профиль ${author.name}`}
            disabled={!profileIdentifier}
            hitSlop={4}
            onPress={(event) => {
              event.stopPropagation();
              openProfile();
            }}
          >
            <Text style={st.listName} numberOfLines={1}>{author.name}</Text>
          </Pressable>
          <Text style={st.listMeta} numberOfLines={2}>
            {new Date(date).toLocaleDateString("ru-RU")} · {listStats}
          </Text>
        </View>
      </View>
    );
  }
  // Instagram-style threads: the avatar remains on the left, while the body
  // starts directly below the one-line name/date rather than below the avatar.
  if (compact) {
    return (
      <View style={st.compactAuthor}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Открыть профиль ${author.name}`}
          disabled={!profileIdentifier}
          hitSlop={5}
          style={st.compactAvatarTap}
          onPress={(event) => {
            event.stopPropagation();
            openProfile();
          }}
        >
          {avatar}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Открыть профиль ${author.name}`}
          disabled={!profileIdentifier}
          style={st.compactAuthorInfo}
          onPress={(event) => {
            event.stopPropagation();
            openProfile();
          }}
        >
          {nameAndDate}
        </Pressable>
      </View>
    );
  }
  return (
    <Pressable
      style={st.author}
      accessibilityRole="button"
      accessibilityLabel={`Открыть профиль ${author.name}`}
      disabled={!profileIdentifier}
      onPress={(event) => {
        event.stopPropagation();
        openProfile();
      }}
    >
      {avatar}
      <View style={st.authorInfo}>{nameAndDate}</View>
    </Pressable>
  );
}
export function QStatus({
  question, compact = false,
}: {question:QuestionListItemDto;compact?:boolean}) {
  return (
    <View style={[st.row, compact && st.listTags]}>
      <Text
        style={[
          st.badge,
          compact && st.listBadge,
          question.status === "resolved"
            ? st.resolved
            : question.status === "answered"
              ? st.answered
              : null,
        ]}
      >
        {question.status === "resolved"
          ? "Решён"
          : question.status === "answered"
            ? "Есть ответы"
            : "Ждёт ответа"}
      </Text>
      {question.closed && <Text style={[st.badge, compact && st.listBadge]}>Закрыто</Text>}
      <Text style={[st.tag, compact && st.listTag]}>{question.category}</Text>
      {question.tags.map((tag) => (
        <Text key={tag} style={[st.tag, compact && st.listTag]}>
          #{tag}
        </Text>
      ))}
    </View>
  );
}
export function QPhotos({
  photos,onRetry,
}: { photos: QuestionPhotoDto[]; onRetry?:()=>void }) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [failed,setFailed] = useState<string[]>([]);
  const [viewerFailed,setViewerFailed] = useState(false);
  const [s3Images,setS3Images] = useState<string[]>([]);
  const { width } = useWindowDimensions();
  const terminalNotice=questionPhotoTerminalNotice(photos);
  const transientFailure=photos.some(p=>failed.includes(questionPhotoReadIdentity(p)));
  const closeViewer = () => {setViewerIndex(null);setViewerFailed(false);};
  const retryPhoto=()=>{
    setFailed([]);
    setS3Images([]);
    setViewerFailed(false);
    closeViewer();
    onRetry?.(); // Fetch a fresh authorized GET, not the expired signed URL.
  };

  return (
    <>
      <View style={st.photoGrid}>
        {questionPhotoGridRows(photos).map((row, rowIndex) => (
          <View key={rowIndex} style={st.photoGridRow}>
            {row.map(({ photo: p, index }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={failed.includes(questionPhotoReadIdentity(p))
                  ? "Повторить загрузку фото" : `Открыть фото ${index + 1} из ${photos.length}`}
                key={p.id}
                style={[st.photoGridCell, photos.length === 1 && st.photoGridSingleCell]}
                disabled={!p.url || (failed.includes(questionPhotoReadIdentity(p)) && !onRetry)}
                onPress={() => {
                  if(failed.includes(questionPhotoReadIdentity(p)))retryPhoto();
                  else if(p.url){setViewerFailed(false);setViewerIndex(index);}
                }}
              >
                {p.url && !failed.includes(questionPhotoReadIdentity(p)) ? (
                  <Image source={{ uri: s3Images.includes(questionPhotoReadIdentity(p)) ? (p.fallbackSmallUrl ?? p.fallbackUrl ?? p.smallUrl ?? p.url) : (p.smallUrl ?? p.url) }}
                    contentFit="cover" style={st.photoGridImage} cachePolicy="disk"
                    recyclingKey={questionPhotoReadIdentity(p)}
                    onError={()=>{
                      const key=questionPhotoReadIdentity(p);
                      if(s3Images.includes(key)) {
                        setFailed(items=>items.includes(key)?items:[...items,key]);
                        return;
                      }
                      void allowQuestionsS3Fallback(p.smallUrl ?? p.url,
                        p.fallbackSmallUrl ?? p.fallbackUrl, fetch, true).then(allowed => {
                          if(allowed)setS3Images(items=>items.includes(key)?items:[...items,key]);
                          else setFailed(items=>items.includes(key)?items:[...items,key]);
                        });
                    }}
                  />
                ) : (
                  <View style={[st.photoGridImage,{alignItems:"center",justifyContent:"center"}]}>
                    <Text style={st.meta}>
                      {failed.includes(questionPhotoReadIdentity(p))?"Фото недоступно · Повторить":
                        p.status==="UNAVAILABLE"?"Фото недоступно":
                        p.status==="FAILED"?"Ошибка обработки фото":"Обрабатываем фото…"}
                    </Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        ))}
      </View>
      {terminalNotice && <Text accessibilityRole="alert" style={st.error}>{terminalNotice}</Text>}
      {transientFailure && onRetry && (
        <Pressable accessibilityRole="button" accessibilityLabel="Повторить загрузку фотографий"
          onPress={retryPhoto} style={{alignSelf:"flex-start",paddingVertical:10,paddingHorizontal:6}}>
          <Text style={{color:COLORS.primary}}>Некоторые фотографии не загрузились · Повторить загрузку</Text>
        </Pressable>
      )}
      {viewerIndex !== null && (
        <Modal
          visible
          animationType="fade"
          onRequestClose={closeViewer}
          supportedOrientations={["portrait", "landscape"]}
        >
          <StatusBar hidden />
          <GestureHandlerRootView style={st.questionPhotoViewer}>
            <SafeAreaProvider>
              <SafeAreaView edges={["top", "bottom"]} style={st.questionPhotoViewer}>
            <View style={st.questionPhotoViewerHeader}>
              <Text style={st.questionPhotoViewerCount}>
                {viewerIndex + 1} / {photos.length}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Закрыть просмотр фотографии"
                hitSlop={8}
                onPress={closeViewer}
                style={st.questionPhotoViewerClose}
              >
                <MaterialCommunityIcons name="close" size={26} color="#fff" />
              </Pressable>
            </View>
            <FlatList
              key={width}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              data={photos}
              initialScrollIndex={Math.min(viewerIndex, photos.length - 1)}
              keyExtractor={(photo) => photo.id}
              getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
              onMomentumScrollEnd={(event) => {
                setViewerFailed(false);
                setViewerIndex(
                  Math.max(0, Math.min(
                    photos.length - 1,
                    Math.round(event.nativeEvent.contentOffset.x / width),
                  )),
                );
              }}
              renderItem={({ item, index }) => (
                <SwipeDismissMedia style={[st.questionPhotoViewerPage, { width }]}
                  enabled={index === viewerIndex} onDismiss={closeViewer}>
                  <Image
                    source={{ uri: s3Images.includes(questionPhotoReadIdentity(item)) ? (item.fallbackUrl ?? item.url) : item.url }}
                    cachePolicy="disk"
                    recyclingKey={questionPhotoReadIdentity(item)+":"+item.url}
                    onError={()=>{
                      const key=questionPhotoReadIdentity(item);
                      if(s3Images.includes(key)) {setViewerFailed(true);return;}
                      void allowQuestionsS3Fallback(item.url,item.fallbackUrl,fetch,true).then(allowed => {
                        if(allowed)setS3Images(items=>items.includes(key)?items:[...items,key]);
                        else setViewerFailed(true);
                      });
                    }}
                    contentFit="contain"
                    style={st.questionPhotoViewerImage}
                    accessibilityLabel={`Фото ${index + 1} из ${photos.length}`}
                  />
                </SwipeDismissMedia>
              )}
            />
              {viewerFailed && (
                <Pressable accessibilityRole="button"
                  accessibilityLabel="Повторить загрузку фотографии"
                  onPress={retryPhoto}
                  style={{alignSelf:"center",padding:12,marginBottom:12}}>
                  <Text style={{color:COLORS.primary}}>Фото недоступно · Повторить</Text>
                </Pressable>
              )}
              </SafeAreaView>
            </SafeAreaProvider>
          </GestureHandlerRootView>
        </Modal>
      )}
    </>
  );
}
export function QBody({
  text,
  compact = false,
  replyToName,
}: {
  text: string;
  compact?: boolean;
  replyToName?: string | null;
}) {
  return (
    <Text style={[st.body, compact && st.compactBody]}>
      {replyToName && <Text style={st.inlineReplyTo}>В ответ {replyToName}: </Text>}
      {text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <Text
            key={i}
            accessibilityRole="link"
            style={{ color: COLORS.primary, textDecorationLine: "underline" }}
            onPress={() => void Linking.openURL(part)}
          >
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}
export function QPhotoPicker({
  photos,
  onChange,
  onBusy,
  compact = false,
  trailingAction,
  submitUploadsRef,
}: {
  photos: QuestionPhotoDto[];
  onChange: (photos: QuestionPhotoDto[]) => void;
  onBusy: (busy: boolean) => void;
  compact?: boolean;
  trailingAction?: ReactNode;
  /** Non-null only in question/answer composers: no S3 before their submit button. */
  submitUploadsRef?: RefObject<(() => Promise<QuestionPhotoDto[]>) | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [failedPhotos, setFailedPhotos] = useState<{key:number;asset:ImagePicker.ImagePickerAsset;
    failure:string;uploading:boolean}[]>([]);
  const [uploadFailures, setUploadFailures] = useState<Record<string, string>>({});
  const preparedDrafts = useRef(new Map<string, PreparedQuestionPhotoVariants>());
  const uploadedDrafts = useRef(new Map<string, QuestionPhotoDto>());
  const live = useRef(true);
  // Do not let a question/answer publish while a chosen photo is still
  // waiting for its own retry or removal. The tile actions remain enabled.
  useEffect(() => {
    onBusy(busy || failedPhotos.length > 0);
  }, [busy, failedPhotos.length, onBusy]);
  useEffect(() => () => onBusy(false), [onBusy]);
  useEffect(() => {
    live.current = true;
    const drafts = preparedDrafts.current;
    const uploaded = uploadedDrafts.current;
    return () => {
      live.current = false;
      for (const variants of drafts.values())
        for (const variant of Object.values(variants)) variant.dispose();
      drafts.clear();
      uploaded.clear();
    };
  }, []);
  // Removing a local tile, canceling an answer or saving the form frees native cache.
  useEffect(() => {
    const activeIds = new Set(photos.map(photo => photo.id));
    for (const [id, variants] of preparedDrafts.current) {
      if (activeIds.has(id)) continue;
      for (const item of Object.values(variants)) item.dispose();
      preparedDrafts.current.delete(id);
      uploadedDrafts.current.delete(id);
    }
  }, [photos]);
  const photoSerial = useRef(0);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  async function uploadOne(asset:ImagePicker.ImagePickerAsset,key?:number) {
    let prepared:Awaited<ReturnType<typeof prepareUploadPhoto>>|null = null;
    let variants: PreparedQuestionPhotoVariants | null = null;
    if(key !== undefined)setFailedPhotos(items => items.map(item=>item.key === key
      ? {...item,uploading:true,failure:""} : item));
    try {
      classifyQuestionNativePhoto(asset);
      setProgress(0);
      prepared = await prepareUploadPhoto(asset)
        .catch(cause => { throw new PhotoUploadStageError("jpeg", cause); });
      let uploaded: QuestionPhotoDto;
      if (submitUploadsRef) {
        // Both variants are generated locally, with NO reserve/POST/S3 call.
        variants = await prepareUploadWebpVariants(prepared, { small: 360, medium: 1440 })
          .catch(error => { throw new PhotoUploadStageError("webp", error); });
        if (!live.current) return;
        const localId = `local-${Crypto.randomUUID()}`;
        preparedDrafts.current.set(localId, variants);
        variants = null;
        uploaded = { id: localId, url: asset.uri, status: "READY" };
      } else {
        uploaded = await uploadClientQuestionsPhoto(prepared,p => setProgress(p));
      }
      if (!live.current) return;
      const next=[...photosRef.current,{...uploaded,url:asset.uri}];
      photosRef.current=next;
      onChange(next);
      if(key !== undefined)setFailedPhotos(items => items.filter(item=>item.key!==key));
    } catch(cause) {
      const diagnostic = photoStageDiagnostic(cause);
      logPhotoUploadFailure("questions", cause);
      reportClientError(new Error("QUESTIONS_CLIENT_PHOTO_FAILED"),
        {issueKey:"Questions",keys:{
          operation:"photo_upload",reason:photoFailureCode(cause),stage:diagnostic.stage,
          nativeName:diagnostic.name, code:diagnostic.code,
        }});
      const failure=photoRetryMessage(cause);
      if(key === undefined)setFailedPhotos(items => [...items,{
        key:++photoSerial.current,asset,failure,uploading:false,
      }]);
      else setFailedPhotos(items => items.map(item=>item.key===key
        ? {...item,uploading:false,failure} : item));
      setError("Не удалось добавить одно из фото. Нажмите круглую стрелку на нём. Другие фото не затронуты.");
    } finally {
      prepared?.dispose();
      if (variants) for (const item of Object.values(variants)) item.dispose();
      setProgress(null);
    }
  }
  async function retryOne(key:number) {
    if(busy)return;
    const failed=failedPhotos.find(item=>item.key===key&&!item.uploading);
    if(!failed)return;
    setBusy(true);setError("");
    try {await uploadOne(failed.asset,key);}
    finally {setBusy(false);}
  }
  async function flushDraftUploads(): Promise<QuestionPhotoDto[]> {
    const ready: QuestionPhotoDto[] = [];
    for (const photo of photosRef.current) {
      if (!photo.id.startsWith("local-")) { ready.push(photo); continue; }
      const completed = uploadedDrafts.current.get(photo.id);
      if (completed) { ready.push(completed); continue; }
      const variants = preparedDrafts.current.get(photo.id);
      if (!variants) throw new Error("Локальное фото недоступно. Добавьте его заново.");
      setProgress(0);
      setUploadFailures(previous => { const copy = { ...previous }; delete copy[photo.id]; return copy; });
      try {
        const uploaded = await uploadClientQuestionsPhoto({
          uri: variants.medium.uri, width: variants.medium.width, height: variants.medium.height,
        }, p => setProgress(p), variants);
        const confirmed = { ...uploaded, url: photo.url };
        uploadedDrafts.current.set(photo.id, confirmed);
        ready.push(confirmed);
      } catch (reason) {
        reportClientError(new Error("QUESTIONS_CLIENT_PHOTO_SEND_FAILED"), {
          issueKey: "Questions", keys: { operation: "photo_send", reason: photoFailureCode(reason) },
        });
        setUploadFailures(previous => ({ ...previous,
          [photo.id]: "Фото не загрузилось. Нажмите кнопку публикации ещё раз; остальные фото сохранятся.",
        }));
        throw new Error("Не удалось загрузить фото. Проверьте интернет и повторите отправку.");
      } finally { setProgress(null); }
    }
    // All files confirmed. Parent receives actual IDs only after full success.
    photosRef.current = ready;
    onChange(ready);
    return ready;
  }
  useEffect(() => {
    if (!submitUploadsRef) return;
    submitUploadsRef.current = flushDraftUploads;
    return () => { submitUploadsRef.current = null; };
  });
  const pick = async () => {
    setError("");
    setBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Доступ к фото", "Разрешите доступ к библиотеке в настройках телефона.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: QUESTION_LIMITS.photos - photosRef.current.length - failedPhotos.length,
        quality: 1,
        ...iosCompatiblePhotoPicker(),
      });
      if (result.canceled) return;
      if (result.assets.length + photosRef.current.length + failedPhotos.length > QUESTION_LIMITS.photos) {
        setError("Можно прикрепить до 5 фото");
        return;
      }
      // One failed image must not stop processing later selected photos.
      for(const asset of result.assets) await uploadOne(asset);
    } catch (e) {
      reportClientError(e,{issueKey:"Questions",keys:{operation:"photo_upload"}});
      setError(e instanceof Error ? e.message : "Не удалось загрузить фото");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };
  return (
    <View style={[st.group, compact && st.compactPhotoPicker]}>
      {(photos.length > 0 || failedPhotos.length > 0) && <View style={[st.row,{flexWrap:"wrap"}]}>
        {failedPhotos.map(item=><View key={`failed-${item.key}`} style={{
          width:"100%",flexDirection:"row",alignItems:"center",gap:12,padding:8,
          backgroundColor:"#f4eee6",borderRadius:12,marginBottom:5,
        }}>
          <View style={{position:"relative",width:90,height:90,flexShrink:0}}>
            <Image source={{uri:item.asset.uri}} contentFit="cover"
              style={{width:90,height:90,borderRadius:10}}/>
            {item.uploading ? <View style={{position:"absolute",left:27,top:27,
              borderRadius:18,backgroundColor:"#17211de0",padding:8}}>
              <MaterialCommunityIcons name="progress-clock" size={22} color="#fff"/>
            </View> : <Pressable accessibilityRole="button"
              accessibilityLabel={`Повторить обработку фото ${item.asset.fileName ?? item.key}`}
              disabled={busy} onPress={()=>void retryOne(item.key)}
              style={{position:"absolute",top:21,left:21,width:48,height:48,
                borderRadius:24,backgroundColor:"#17211df0",borderWidth:1,
                borderColor:"#fffc",alignItems:"center",justifyContent:"center"}}>
              <MaterialCommunityIcons name="refresh" size={30} color="#fff"/>
            </Pressable>}
            <Pressable accessibilityRole="button" accessibilityLabel="Убрать неудавшееся фото"
              disabled={busy} onPress={()=>setFailedPhotos(items=>items.filter(photo=>photo.key!==item.key))}
              style={{position:"absolute",right:0,top:0,width:28,height:28,
                borderRadius:14,backgroundColor:"#faf7ef",alignItems:"center",justifyContent:"center"}}>
              <MaterialCommunityIcons name="close" size={18} color="#60392e"/>
            </Pressable>
          </View>
          <View style={{flex:1,minWidth:0,gap:4}}>
            <Text numberOfLines={1} style={{color:COLORS.text,fontSize:12}}>
              {item.asset.fileName ?? "Фото не обработано"}
            </Text>
            {!!item.failure && <Text accessibilityRole="alert" style={{
              color:"#92351f",fontSize:12,lineHeight:17,
            }}>{item.failure}</Text>}
          </View>
        </View>)}
        {photos.map((p) => (
          <View key={p.id}>
            <Image source={{ uri: p.url }} contentFit="cover" style={[st.photo, compact && st.compactPhoto]} />
            {uploadFailures[p.id] && <Pressable accessibilityRole="button"
              accessibilityLabel="Повторить загрузку этого фото при отправке"
              onPress={() => setUploadFailures(previous => {
                const next = { ...previous }; delete next[p.id]; return next;
              })} style={{ position: "absolute", left: 3, top: 3, width: 34,
                height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center",
                backgroundColor: "#17211de8" }}>
              <MaterialCommunityIcons name="refresh" size={23} color="#fff" />
            </Pressable>}
            {p.id.startsWith("local-") && <Text style={st.meta}>
              {uploadFailures[p.id] ? "Ошибка загрузки · повторите отправку" : "Готово к отправке"}
            </Text>}
            <Pressable
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Убрать фото"
              hitSlop={compact ? 8 : undefined}
              style={[st.removePhoto, compact && st.compactRemovePhoto]}
              onPress={() => {
                const remove=async()=>{
                  const remote=p.url.startsWith("https://") || p.url.startsWith("http://");
                  setBusy(true);
                  setError("");
                  try{
                    // Existing attached photos are unbound atomically when
                    // the editor saves; a draft upload needs explicit DELETE.
                    if (p.id.startsWith("local-")) {
                      const confirmed = uploadedDrafts.current.get(p.id);
                      if (confirmed) await discardQuestionPhoto(confirmed.id);
                      uploadedDrafts.current.delete(p.id);
                    } else if (!remote) await discardQuestionPhoto(p.id);
                    onChange(photos.filter(x=>x.id!==p.id));
                  }catch(e){
                    reportClientError(e,{issueKey:"Questions",keys:{operation:"photo_remove"}});
                    setError(e instanceof Error?e.message:"Не удалось удалить фото");
                  }finally{
                    setBusy(false);
                  }
                };
                void remove();
              }}
            >
              <MaterialCommunityIcons name="close" size={compact ? 16 : 22} color={COLORS.text} />
            </Pressable>
          </View>
        ))}
      </View>}
      {compact ? (
        <View style={[st.compactPhotoToolbar, !trailingAction && st.compactPhotoToolbarStandalone]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={photos.length + failedPhotos.length >= QUESTION_LIMITS.photos ? "Лимит фото достигнут" : "Добавить фото"}
            accessibilityHint={`${photos.length + failedPhotos.length} из ${QUESTION_LIMITS.photos} фото. До 10 МБ каждое`}
            accessibilityState={{ disabled: busy || photos.length + failedPhotos.length >= QUESTION_LIMITS.photos }}
            disabled={busy || photos.length + failedPhotos.length >= QUESTION_LIMITS.photos}
            onPress={() => void pick()}
            style={({ pressed }) => [
              st.compactPhotoAction,
              !trailingAction && st.compactPhotoActionStandalone,
              (pressed || busy || photos.length + failedPhotos.length >= QUESTION_LIMITS.photos) && { opacity: 0.6 },
            ]}
          >
            <View style={[st.compactPhotoIcon, !trailingAction && st.compactPhotoIconLarge]}>
              <MaterialCommunityIcons
                name="image-plus-outline"
                size={trailingAction ? 19 : 24}
                color={COLORS.primary}
              />
            </View>
            <View style={st.compactPhotoCopy}>
              <Text numberOfLines={trailingAction ? 1 : 2} style={st.compactPhotoText}>
                {busy || progress !== null
                  ? progress === null ? "Подготовка фото…" : progress >= 100 ? "Обработка фото…" : `Загрузка ${progress}%`
                  : photos.length + failedPhotos.length >= QUESTION_LIMITS.photos
                    ? "Добавлено максимум фото"
                    : photos.length > 0 ? "Добавить ещё фото" : "Добавить фото"}
              </Text>
              {!trailingAction && (
                <Text style={st.compactPhotoHint}>
                  {photos.length + failedPhotos.length} из {QUESTION_LIMITS.photos} фото · до 10 МБ каждое
                </Text>
              )}
            </View>
            {trailingAction ? (
              <Text style={st.compactPhotoHint}>{photos.length + failedPhotos.length}/{QUESTION_LIMITS.photos}</Text>
            ) : (
              <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.primary} />
            )}
          </Pressable>
          {trailingAction}
        </View>
      ) : (
        <>
          <QButton
            label={busy || progress !== null ? (progress===null?"Подготовка фото…" :
              progress>=100?"Обработка фото…":"Загрузка "+progress+"%") : "Прикрепить фото"}
            secondary
            icon="image-plus"
            disabled={busy || photos.length + failedPhotos.length >= QUESTION_LIMITS.photos}
            onPress={() => void pick()}
          />
          <Text style={st.meta}>До 5 фото · до 10 МБ каждое</Text>
        </>
      )}
      {error && (
        <Text accessibilityRole="alert" style={st.error}>
          {error}
        </Text>
      )}
    </View>
  );
}
export function QInput({
  label,
  value,
  onChange,
  onFocus,
  onBlur,
  multiline,
  minHeight,
  maxLength,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  multiline?: boolean;
  minHeight?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <View style={st.group}>
      <Text style={st.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        multiline={multiline}
        scrollEnabled={multiline ? false : undefined}
        maxLength={maxLength}
        placeholder={placeholder}
        placeholderTextColor="#6a655b"
        style={[
          st.input,
          multiline
            ? { minHeight: minHeight ?? 140, lineHeight: 24, textAlignVertical: "top" }
            : st.singleLineInput,
        ]}
      />
    </View>
  );
}
export const st = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  questionPhotoViewer: { flex: 1, backgroundColor: "#101010" },
  questionPhotoViewerHeader: {
    minHeight: 52,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  questionPhotoViewerCount: { color: "#fff", fontFamily: FONTS.montserratMedium, fontSize: 14 },
  questionPhotoViewerClose: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  questionPhotoViewerPage: { flex: 1, paddingHorizontal: 12, justifyContent: "center" },
  questionPhotoViewerImage: { flex: 1, width: "100%" },
  group: { gap: 8 },
  compactPhotoPicker: { gap: 8 },
  compactPhotoToolbar: {
    minHeight: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  compactPhotoToolbarStandalone: { minHeight: 72, alignItems: "stretch" },
  compactPhotoAction: {
    minHeight: 44,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#b8bea7",
    backgroundColor: "#f4f6ea",
  },
  compactPhotoActionStandalone: {
    flex: 1,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderColor: "#a3af87",
    borderStyle: "dashed",
  },
  compactPhotoIcon: { width: 26, height: 26, alignItems: "center", justifyContent: "center" },
  compactPhotoIconLarge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#e3ead7",
  },
  compactPhotoCopy: { flexShrink: 1, flexGrow: 1, minWidth: 0, gap: 2 },
  compactPhotoText: {
    fontFamily: FONTS.montserratMedium,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.primary,
  },
  compactPhotoHint: {
    fontFamily: FONTS.montserrat,
    fontSize: 11,
    lineHeight: 17,
    color: COLORS.textSecondary,
  },
  compactPhoto: { width: 64, height: 64, borderRadius: 8 },
  compactRemovePhoto: { width: 26, height: 26, borderRadius: 13 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  card: { backgroundColor: COLORS.cardBackground, borderRadius: 16, padding: 18, gap: 16 },
  listCard: { padding: 12, gap: 8, borderRadius: 14 },
  listTitle: {
    fontFamily: FONTS.montserratBold,
    fontSize: 17,
    lineHeight: 24,
    color: COLORS.text,
  },
  listPreview: { backgroundColor: "#e3ead7", padding: 9, borderRadius: 9, gap: 3 },
  listTags: { gap: 6, rowGap: 4 },
  listBadge: { paddingHorizontal: 8, paddingVertical: 3, fontSize: 11, lineHeight: 16 },
  listTag: { paddingHorizontal: 0, paddingVertical: 2, fontSize: 11, lineHeight: 17 },
  listAuthor: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 32 },
  listAuthorInfo: { flex: 1, minWidth: 0, gap: 1 },
  listName: {
    fontFamily: FONTS.montserratMedium, fontSize: 12,
    lineHeight: 17, color: COLORS.text,
  },
  listMeta: { fontFamily: FONTS.montserrat, fontSize: 11, lineHeight: 16, color: "#5b564b" },
  title: { fontFamily: FONTS.montserratBold, fontSize: 22, lineHeight: 31, color: COLORS.text },
  body: { fontFamily: FONTS.montserrat, fontSize: 15, lineHeight: 25, color: COLORS.text },
  compactBody: { fontSize: 14, lineHeight: 21 },
  inlineReplyTo: { fontFamily: FONTS.montserratMedium, fontSize: 12, color: COLORS.textSecondary },
  label: { fontFamily: FONTS.montserratMedium, fontSize: 14, color: COLORS.text },
  meta: { fontFamily: FONTS.montserrat, fontSize: 12, lineHeight: 19, color: "#5b564b" },
  badge: {
    backgroundColor: "#e7dfc4",
    color: "#66521c",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontFamily: FONTS.montserratMedium,
    fontSize: 11,
  },
  answered: { backgroundColor: "#e0e7ed", color: "#304f66" },
  resolved: { backgroundColor: "#dfe8d2", color: "#3b4822" },
  tag: { color: "#57564d", fontFamily: FONTS.montserrat, fontSize: 11, padding: 6 },
  button: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  compactButton: {
    minHeight: 36,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 10,
    gap: 5,
  },
  secondary: { backgroundColor: "transparent", borderColor: "#b0ad9c", borderWidth: 1 },
  selected: { backgroundColor: "#e1e6d0", borderColor: COLORS.primary },
  buttonText: { fontFamily: FONTS.montserratMedium, color: "#fff", fontSize: 13 },
  compactButtonText: { fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#aaa791",
    borderRadius: 10,
    padding: 12,
    minHeight: 46,
    backgroundColor: "#faf7ef",
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
    fontSize: 15,
  },
  singleLineInput: {
    // Preserve the former 24px line + 24px padding + 2px border height.
    height: 50,
    paddingVertical: 0,
    textAlignVertical: "center",
    includeFontPadding: false,
  },
  author: { flexDirection: "row", gap: 10, alignItems: "center" },
  compactAuthor: { minHeight: 32, position: "relative" },
  compactAvatarTap: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 32,
    height: 32,
  },
  authorInfo: { flex: 1 },
  compactAuthorInfo: {
    minHeight: 22,
    marginLeft: 40,
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: 6,
  },
  compactName: { fontFamily: FONTS.montserratBold, fontSize: 13, flexShrink: 1 },
  compactDate: { fontSize: 11, lineHeight: 17 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  compactAvatar: { width: 32, height: 32, borderRadius: 16 },
  initial: { backgroundColor: "#e1e6d0", alignItems: "center", justifyContent: "center" },
  photoGrid: { width: "100%", gap: 8 },
  photoGridRow: { flexDirection: "row", width: "100%", gap: 8 },
  photoGridCell: { flex: 1, minWidth: 0, aspectRatio: 1, borderRadius: 10, overflow: "hidden", backgroundColor: "#e9e5d9" },
  photoGridSingleCell: { aspectRatio: 1.6 },
  photoGridImage: { width: "100%", height: "100%" },
  photo: { width: 110, height: 110, borderRadius: 10 },
  removePhoto: {
    position: "absolute",
    right: 2,
    top: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#faf7ef",
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    color: "#9e2933",
    backgroundColor: "#f4e4df",
    padding: 14,
    borderRadius: 10,
    fontFamily: FONTS.montserrat,
    fontSize: 14,
    lineHeight: 22,
  },
  notice: {
    color: COLORS.text,
    backgroundColor: "#e7e3d5",
    padding: 14,
    borderRadius: 10,
    fontFamily: FONTS.montserrat,
    fontSize: 14,
    lineHeight: 22,
  },
  answer: { paddingVertical: 18, borderTopWidth: 1, borderColor: "#d5d1c0", gap: 12 },
  reply: { marginLeft: 16, paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: "#b6bea0" },
  best: { backgroundColor: "#e6eddc", borderRadius: 12, padding: 14 },
});