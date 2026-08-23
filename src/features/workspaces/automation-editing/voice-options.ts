export type AutomationVoiceOption = {
  value: string;
  label: string;
  gender?: string;
  category?: string;
};

export const automationVoiceOptions: AutomationVoiceOption[] = [
  { value: 'auto', label: 'AI 自动选择音色' },
  { value: 'voice-guanggao', label: '广告解说', gender: '男', category: '视频配音' },
  { value: 'voice-jieshuo-xiaoming', label: '解说小明', gender: '男', category: '视频配音' },
  { value: 'voice-vivi', label: 'Vivi', gender: '女', category: '通用场景' },
  { value: 'voice-xiaohe', label: '小何', gender: '女', category: '通用场景' },
  { value: 'voice-wennuan-ahu', label: '温暖阿虎', gender: '男', category: '通用场景' },
  { value: 'voice-wenrou-mama', label: '温柔妈妈', gender: '女', category: '通用场景' },
  { value: 'voice-qingshuang-nansheng', label: '清爽男声', gender: '男', category: '通用场景' },
  { value: 'voice-kefu-wanjun', label: '客服婉君', gender: '女', category: '客服' },
  { value: 'voice-shaonian-zixin', label: '少年梓辛', gender: '男', category: '通用场景' }
];
