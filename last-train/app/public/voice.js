const MAX_PENDING_CANDIDATES = 32;
const CANDIDATE_WAIT_MS = 10000;

export class Voice {
  constructor(send, status) {
    this.send = send;
    this.status = status;
    this.peers = new Map();
    this.allowed = new Map();
    this.stream = null;
    this.enabled = false;
    this.id = null;
    this.starting = null;
    this.epoch = 0;
  }
  setId(id) {
    this.id = id;
  }
  enable() {
    if (this.starting) return this.starting;
    if (this.enabled) return Promise.resolve(true);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.status("语音需要 HTTPS 或本机 localhost，请使用文字聊天。");
      return Promise.resolve(false);
    }
    const epoch = this.epoch;
    this.starting = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        if (epoch !== this.epoch) {
          stream.getTracks().forEach((track) => track.stop());
          return false;
        }
        this.stream = stream;
        this.enabled = true;
        await this.replaceTracks();
        this.listen();
        this.status("麦克风已启用，等待频道连接。");
        return true;
      } catch (error) {
        this.stop();
        this.status(`麦克风启用失败：${error.message}`);
        return false;
      } finally {
        this.starting = null;
      }
    })();
    return this.starting;
  }
  stop() {
    this.epoch++;
    this.enabled = false;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.replaceTracks().catch((error) =>
      this.status(`麦克风已停止，频道更新失败：${error.message}`),
    );
    this.status("麦克风已关闭；可继续收听已启用的频道。");
  }
  listen() {
    for (const peer of this.peers.values())
      if (peer.audio.srcObject)
        peer.audio
          .play()
          .catch(() => this.status("播放被浏览器阻止，请检查站点声音权限。"));
  }
  async replaceTracks() {
    for (const [id, peer] of this.peers) {
      const permission = this.allowed.get(id);
      await peer.sender.replaceTrack(
        this.enabled && permission?.canSend
          ? this.stream.getAudioTracks()[0]
          : null,
      );
    }
  }
  close(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    clearTimeout(peer.pendingTimer);
    peer.candidates.length = 0;
    peer.pc.close();
    peer.audio.remove();
    this.peers.delete(id);
  }
  disconnect() {
    this.stop();
    for (const id of this.peers.keys()) this.close(id);
    this.allowed.clear();
    this.status("连接断开，语音已中止。");
  }
  update(list) {
    const next = new Map(list.map((p) => [p.id, p]));
    for (const [id, old] of this.allowed) {
      const current = next.get(id);
      if (
        !current ||
        current.canSend !== old.canSend ||
        current.canReceive !== old.canReceive
      )
        this.close(id);
    }
    this.allowed = next;
    if (!this.allowed.size)
      this.status(
        this.enabled ? "当前频道没有其他可连接的乘客。" : "麦克风未启用",
      );
    for (const permission of next.values()) {
      if (
        (permission.canSend || permission.canReceive) &&
        !this.peers.has(permission.id)
      )
        this.create(permission);
    }
  }
  create(permission) {
    if (!window.RTCPeerConnection || !this.id) return;
    // STUN endpoint used by the official WebRTC trickle-ICE sample. No TURN relay is configured.
    const id = permission.id,
      pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      }),
      audio = document.createElement("audio");
    audio.autoplay = true;
    document.body.append(audio);
    const peer = {
      pc,
      audio,
      makingOffer: false,
      ignoreOffer: false,
      polite: this.id.localeCompare(id) > 0,
      candidates: [],
      pendingTimer: null,
    };
    this.peers.set(id, peer);
    const track =
      permission.canSend && this.enabled
        ? this.stream?.getAudioTracks()[0]
        : null;
    const direction = permission.canSend
      ? permission.canReceive
        ? "sendrecv"
        : "sendonly"
      : "recvonly";
    peer.sender = pc.addTransceiver(track || "audio", {
      direction,
      ...(track ? { streams: [this.stream] } : {}),
    }).sender;
    pc.onicecandidate = (event) => {
      if (event.candidate)
        this.send({
          type: "signal",
          targetId: id,
          data: { candidate: event.candidate.toJSON() },
        });
    };
    pc.ontrack = (event) => {
      if (!permission.canReceive) return;
      audio.srcObject = event.streams[0] || new MediaStream([event.track]);
      audio
        .play()
        .catch(() => this.status("浏览器阻止播放，请点击启用语音后重试。"));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected")
        this.status(
          this.enabled
            ? "语音频道已连接 · 麦克风开启"
            : "语音频道已连接 · 仅收听",
        );
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected"
      )
        this.status(
          "语音连接失败。当前未配置中继，跨网络可能无法通话；请用文字聊天。",
        );
    };
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        if (pc.signalingState !== "closed")
          this.send({
            type: "signal",
            targetId: id,
            data: { description: pc.localDescription.toJSON() },
          });
      } catch (error) {
        if (pc.signalingState !== "closed")
          this.status(`语音协商失败：${error.message}`);
      } finally {
        peer.makingOffer = false;
      }
    };
    return peer;
  }
  async receive(id, data) {
    const permission = this.allowed.get(id);
    if (!permission) return;
    const peer = this.peers.get(id) || this.create(permission);
    if (!peer) return;
    const pc = peer.pc;
    try {
      if (data.description) {
        const collision =
          data.description.type === "offer" &&
          (peer.makingOffer || pc.signalingState !== "stable");
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(data.description);
        clearTimeout(peer.pendingTimer);
        peer.pendingTimer = null;
        for (const candidate of peer.candidates.splice(0))
          await pc.addIceCandidate(candidate);
        if (data.description.type === "offer") {
          await pc.setLocalDescription();
          this.send({
            type: "signal",
            targetId: id,
            data: { description: pc.localDescription.toJSON() },
          });
        }
      } else if (data.candidate && !peer.ignoreOffer) {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
        else {
          if (peer.candidates.length >= MAX_PENDING_CANDIDATES) {
            this.close(id);
            this.allowed.delete(id);
            this.status("语音连接请求异常，已断开该乘客。");
            return;
          }
          if (!peer.pendingTimer)
            peer.pendingTimer = setTimeout(() => {
              if (this.peers.get(id) !== peer || peer.pc.remoteDescription)
                return;
              this.close(id);
              this.allowed.delete(id);
              this.status("语音连接等待超时，已断开该乘客。");
            }, CANDIDATE_WAIT_MS);
          peer.candidates.push(data.candidate);
        }
      }
    } catch (error) {
      if (pc.signalingState !== "closed")
        this.status(`语音连接错误：${error.message}`);
    }
  }
}
