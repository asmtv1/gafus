"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type * as VoxTypes from "voximplant-websdk";

type VoxClient = ReturnType<typeof VoxTypes.getInstance>;
type VoxCall = ReturnType<VoxClient["callConference"]>;
type Prepared = { username: string; room: string };
type Result<T> = { success: true; data: T } | { success: false; error: string };
type TokenResult = { success: true; token: string } | { success: false; error: string };

interface Props {
  bookingId: string;
  backHref: string;
  prepare: (bookingId: string) => Promise<Result<Prepared>>;
  signKey: (bookingId: string, key: string) => Promise<TokenResult>;
  authorizeJoin: (bookingId: string) => Promise<Result<{ admission: string; expires: number }>>;
}

export function VoxConsultationRoom({ bookingId, backHref, prepare, signKey, authorizeJoin }: Props) {
  const [status, setStatus] = useState("Готовы к консультации");
  const [busy, setBusy] = useState(false);
  const [dialing, setDialing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sdkRef = useRef<VoxClient | null>(null);
  const callRef = useRef<VoxCall | null>(null);
  const localRef = useRef<HTMLDivElement>(null);
  const remoteRef = useRef<HTMLDivElement>(null);
  const joiningRef = useRef(false);
  const attemptRef = useRef(0);
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    const call = callRef.current;
    callRef.current = null;
    try { call?.hangup(); } catch { /* already disconnected */ }
    const sdk = sdkRef.current;
    sdkRef.current = null;
    if (sdk) {
      void sdk.showLocalVideo(false).catch(() => undefined);
      void sdk.disconnect().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; attemptRef.current += 1; cleanup(); };
  }, [cleanup]);

  const leave = useCallback(() => {
    attemptRef.current += 1;
    cleanup();
    setDialing(false);
    setBusy(false);
    setConnected(false);
    setStatus("Вы вышли из видеовстречи");
  }, [cleanup]);

  const join = useCallback(async () => {
    if (joiningRef.current || dialing || connected) return;
    joiningRef.current = true;
    const attempt = ++attemptRef.current;
    cleanup();
    const checkActive = () => {
      if (attempt !== attemptRef.current) throw new Error("Подключение отменено");
    };
    setBusy(true);
    setError(null);
    try {
      if (!window.isSecureContext) throw new Error("Для камеры и микрофона необходимо HTTPS");
      setStatus("Проверяем доступ к консультации…");
      const access = await prepare(bookingId);
      checkActive();
      if (!access.success) throw new Error(access.error);
      const VoxImplant = await import("voximplant-websdk");
      checkActive();
      const sdk = VoxImplant.getInstance();
      sdkRef.current = sdk;
      if (!sdk.alreadyInitialized) await sdk.init({ micRequired: true });
      checkActive();
      setStatus("Соединяемся с Voximplant…");
      await sdk.connect();
      checkActive();
      const auth = await sdk.requestOneTimeLoginKey(access.data.username);
      checkActive();
      if (!auth.key || auth.code !== 302) throw new Error("Не удалось получить ключ авторизации Voximplant");
      const signed = await signKey(bookingId, auth.key);
      checkActive();
      if (!signed.success) throw new Error(signed.error);
      const login = await sdk.loginWithOneTimeKey(access.data.username, signed.token);
      checkActive();
      if (!login.result) throw new Error("Voximplant отклонил вход в конференцию");
      if (localRef.current) {
        const preview = await sdk.showLocalVideo(true);
        checkActive();
        if (preview && localRef.current) {
          preview.render(localRef.current);
          preview.element.muted = true;
          preview.element.style.cssText = "width:100%;height:100%;object-fit:cover;";
          preview.element.setAttribute("playsinline", "");
        }
      }
      // Authorize as close to dialing as possible; the proof expires after 90s.
      // VoxEngine checks it before answering the call (the room name is NOT a key).
      const admission = await authorizeJoin(bookingId);
      checkActive();
      if (!admission.success) throw new Error(admission.error);
      const call = sdk.callConference({
        number: access.data.room,
        video: { sendVideo: true, receiveVideo: true },
        customData: admission.data.admission,
      });
      callRef.current = call;

      const attachEndpoint = (endpoint: { mediaRenderers: Array<{ render: (node: HTMLElement) => void; element: HTMLMediaElement; id: string }>; on: (event: VoxTypes.EndpointEvents, cb: (event: { mediaRenderer: { render: (node: HTMLElement) => void; element: HTMLMediaElement; id: string } }) => void) => void }) => {
        const attach = (renderer: { render: (node: HTMLElement) => void; element: HTMLMediaElement; id: string }) => {
          if (!remoteRef.current) return;
          renderer.render(remoteRef.current);
          renderer.element.autoplay = true;
          renderer.element.style.cssText = renderer.element.tagName === "VIDEO" ? "width:100%;height:100%;object-fit:cover;" : "";
          renderer.element.setAttribute("playsinline", "");
        };
        endpoint.on(VoxImplant.EndpointEvents.RemoteMediaAdded, (event) => attach(event.mediaRenderer));
        for (const renderer of endpoint.mediaRenderers) attach(renderer);
      };
      call.on(VoxImplant.CallEvents.EndpointAdded, (event: { endpoint: Parameters<typeof attachEndpoint>[0] }) =>
        attachEndpoint(event.endpoint));
      call.on(VoxImplant.CallEvents.Connected, () => {
        if (mountedRef.current) { setConnected(true); setDialing(false); setStatus("Видеовстреча началась"); }
        for (const endpoint of call.getEndpoints()) attachEndpoint(endpoint);
      });
      call.on(VoxImplant.CallEvents.Disconnected, () => {
        if (mountedRef.current) { setConnected(false); setDialing(false); setStatus("Звонок завершён"); }
      });
      call.on(VoxImplant.CallEvents.Failed, () => {
        if (mountedRef.current) { setConnected(false); setDialing(false); setError("Не удалось установить видеосвязь. Попробуйте снова."); }
      });
      checkActive();
      setDialing(true);
      setStatus("Ожидаем подключения…");
    } catch (cause) {
      // A superseded attempt must never disconnect a newer active connection.
      if (attempt === attemptRef.current) cleanup();
      if (mountedRef.current && attempt === attemptRef.current) {
        setDialing(false);
        setError(cause instanceof Error ? cause.message : "Ошибка подключения");
        setStatus("Не удалось подключиться");
      }
    } finally {
      joiningRef.current = false;
      if (mountedRef.current && attempt === attemptRef.current) setBusy(false);
    }
  }, [bookingId, connected, dialing, prepare, signKey, authorizeJoin, cleanup]);

  const toggleMute = () => {
    if (!callRef.current) return;
    if (muted) callRef.current.unmuteMicrophone();
    else callRef.current.muteMicrophone();
    setMuted(!muted);
  };
  const toggleCamera = () => {
    if (!callRef.current) return;
    const next = !cameraEnabled;
    void callRef.current.sendVideo(next).then(() => setCameraEnabled(next))
      .catch(() => setError("Не удалось переключить камеру"));
  };

  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px", color: "#24332c" }}>
      <a href={backHref} style={{ display: "inline-block", marginBottom: 16 }}>← К консультациям</a>
      <h1 style={{ fontSize: "clamp(1.4rem, 4vw, 2rem)", marginBottom: 8 }}>Видеоконсультация</h1>
      <p role="status" aria-live="polite">{status}</p>
      {error && <p role="alert" style={{ color: "#b3261e" }}>{error}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 310px), 1fr))", gap: 16, margin: "24px 0" }}>
        <section style={{ height: "clamp(245px, 30vw, 380px)", position: "relative", background: "#101d1c", borderRadius: 20, overflow: "hidden" }}>
          <div ref={remoteRef} style={{ width: "100%", height: "100%" }} />
          <span style={{ position: "absolute", bottom: 12, left: 12, color: "white" }}>Кинолог / клиент</span>
        </section>
        <section style={{ height: "clamp(245px, 30vw, 380px)", position: "relative", background: "#29342d", borderRadius: 20, overflow: "hidden" }}>
          <div ref={localRef} style={{ width: "100%", height: "100%" }} />
          <span style={{ position: "absolute", bottom: 12, left: 12, color: "white" }}>Вы</span>
        </section>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {!connected && <button type="button" disabled={busy || dialing} onClick={() => void join()}
          style={{ border: 0, borderRadius: 16, background: "#f3bf59", padding: "12px 22px", cursor: "pointer" }}>
          {busy || dialing ? "Подключение…" : "Подключиться"}
        </button>}
        <button type="button" disabled={!connected} onClick={toggleMute}
          style={{ borderRadius: 16, padding: "12px 22px" }}>{muted ? "Включить микрофон" : "Выключить микрофон"}</button>
        <button type="button" disabled={!connected} onClick={toggleCamera}
          style={{ borderRadius: 16, padding: "12px 22px" }}>{cameraEnabled ? "Выключить камеру" : "Включить камеру"}</button>
        <button type="button" disabled={!busy && !dialing && !connected} onClick={leave}
          style={{ borderRadius: 16, padding: "12px 22px", background: "#a63632", color: "white" }}>Завершить звонок</button>
      </div>
      <p style={{ marginTop: 16, fontSize: 14 }}>Вход доступен с двух сторон после подтверждения записи.
        Разрешите браузеру использовать камеру и микрофон. При обрыве связи можно подключиться повторно.</p>
    </main>
  );
}
