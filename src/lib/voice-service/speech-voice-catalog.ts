export type SpeechVoiceCatalogItem = {
  id: string;
  displayName: string;
  gender: string;
  language: string;
  category: string;
  previewUrl?: string;
  provider: 'doubao';
  providerVoiceId: string;
  resourceId: string;
};

const resourceId = 'seed-tts-2.0';

export const speechVoiceCatalog: SpeechVoiceCatalogItem[] = [
  {
    id: 'voice-guanggao',
    displayName: '广告解说',
    gender: '男',
    language: 'zh-cn',
    category: '视频配音',
    previewUrl:
      'https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_hz_ihsph/ljhwZthlaukjlkulzlp/portal/bigtts/zh_male_guanggaojieshuo_uranus_bigtts.mp3',
    provider: 'doubao',
    providerVoiceId: 'zh_male_guanggaojieshuo_uranus_bigtts',
    resourceId
  },
  {
    id: 'voice-jieshuo-xiaoming',
    displayName: '解说小明',
    gender: '男',
    language: 'zh-cn',
    category: '视频配音',
    previewUrl:
      'https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_hz_ihsph/ljhwZthlaukjlkulzlp/portal/bigtts/zh_male_jieshuoxiaoming_uranus_bigtts.mp3',
    provider: 'doubao',
    providerVoiceId: 'zh_male_jieshuoxiaoming_uranus_bigtts',
    resourceId
  },
  {
    id: 'voice-vivi',
    displayName: 'Vivi',
    gender: '女',
    language: 'zh-cn',
    category: '通用场景',
    previewUrl:
      'https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_hz_ihsph/ljhwZthlaukjlkulzlp/portal/bigtts/zh_female_vv_uranus_bigtts.wav',
    provider: 'doubao',
    providerVoiceId: 'zh_female_vv_uranus_bigtts',
    resourceId
  },
  {
    id: 'voice-xiaohe',
    displayName: '小何',
    gender: '女',
    language: 'zh-cn',
    category: '通用场景',
    previewUrl:
      'https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_hz_ihsph/ljhwZthlaukjlkulzlp/portal/bigtts/zh_female_xiaohe_uranus_bigtts.mp3',
    provider: 'doubao',
    providerVoiceId: 'zh_female_xiaohe_uranus_bigtts',
    resourceId
  },
  {
    id: 'voice-wennuan-ahu',
    displayName: '温暖阿虎',
    gender: '男',
    language: 'zh-cn',
    category: '通用场景',
    previewUrl:
      'https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_hz_ihsph/ljhwZthlaukjlkulzlp/portal/bigtts/audio/zh_male_wennuanahu_uranus_bigtts.mp3',
    provider: 'doubao',
    providerVoiceId: 'zh_male_wennuanahu_uranus_bigtts',
    resourceId
  },
  {
    id: 'voice-wenrou-mama',
    displayName: '温柔妈妈',
    gender: '女',
    language: 'zh-cn',
    category: '通用场景',
    previewUrl:
      'https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_hz_ihsph/ljhwZthlaukjlkulzlp/portal/bigtts/zh_female_wenroumama_uranus_bigtts.mp3',
    provider: 'doubao',
    providerVoiceId: 'zh_female_wenroumama_uranus_bigtts',
    resourceId
  },
  {
    id: 'voice-qingshuang-nansheng',
    displayName: '清爽男声',
    gender: '男',
    language: 'zh-cn',
    category: '通用场景',
    previewUrl:
      'https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_hz_ihsph/ljhwZthlaukjlkulzlp/portal/bigtts/zh_male_qingshuangnanda_uranus_bigtts.mp3',
    provider: 'doubao',
    providerVoiceId: 'zh_male_qingshuangnanda_uranus_bigtts',
    resourceId
  },
  {
    id: 'voice-kefu-wanjun',
    displayName: '客服婉君',
    gender: '女',
    language: 'zh-cn',
    category: '客服',
    previewUrl:
      'https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_hz_ihsph/ljhwZthlaukjlkulzlp/portal/bigtts/audio/ICL_uranus_zh_female_kefuwanjun_tob.mp3',
    provider: 'doubao',
    providerVoiceId: 'ICL_uranus_zh_female_kefuwanjun_tob',
    resourceId
  },
  {
    id: 'voice-shaonian-zixin',
    displayName: '少年梓辛',
    gender: '男',
    language: 'zh-cn',
    category: '通用场景',
    previewUrl:
      'https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_hz_ihsph/ljhwZthlaukjlkulzlp/portal/bigtts/zh_male_shaonianzixin_uranus_bigtts.mp3',
    provider: 'doubao',
    providerVoiceId: 'zh_male_shaonianzixin_uranus_bigtts',
    resourceId
  }
];

export function resolveSpeechVoiceId(productVoiceId: string) {
  const defaultVoice = process.env.DOUBAO_SPEECH_DEFAULT_VOICE?.trim();
  const fallback = defaultVoice || speechVoiceCatalog[0]?.providerVoiceId;

  // AI 自动选择：返回默认音色（如已配置），否则首个推荐音色。
  if (!productVoiceId || productVoiceId === 'auto') {
    return fallback;
  }

  // 直接是 provider voice_type（seed-tts-2.0 的真实音色 ID），直通合成。
  // 视频生产下拉框、音色库均使用 voice_type 作为产品侧 id。
  if (/^(zh_|en_|ICL_)/.test(productVoiceId)) return productVoiceId;

  // 兼容旧的产品侧 id（如 voice-guanggao），将其映射到 provider voice_type。
  const item = speechVoiceCatalog.find((voice) => voice.id === productVoiceId);
  return item?.providerVoiceId || fallback;
}
