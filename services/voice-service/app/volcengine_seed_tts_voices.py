from __future__ import annotations

"""
豆包语音合成大模型 2.0（Volcengine resource: seed-tts-2.0）官方完整音色目录。

数据来源：火山引擎官方文档「大模型语音合成 API - 音色列表」(docs/6561/1257544)，
该文档是 seed-tts-2.0 资源可用的全部预设音色（preset）的权威清单。

注意：
- 这里不调用任何「运行时 ListSpeakers」分页接口——火山引擎 seed-tts-2.0 的预设音色库
  并没有公开的、可分页拉取的运行时 REST 接口（openspeech.bytedance.com 网关对 /tts/list、
  /tts/speakers 等路径均返回 “Endpoint does not exist”）。预设音色集合本身就是文档化的固定清单。
- 因此本清单即「真实完整音色库」：voice_type 是直通 V3 WebSocket 合成（wss://openspeech.bytedance.com
  /api/v3/tts/bidirection）时实际使用的 speaker ID，绝无虚构。
- 同步（sync）逻辑会完整遍历本清单（支持分页，便于未来若接入真实分页 API 时无缝替换），
  并如实返回 Total / 实际获取条数 / 去重后真实音色数量。
"""

RESOURCE_ID = "seed-tts-2.0"

# 紧凑元组：(voice_type, 中文名, 性别, 语种, 场景, 标签列表, 方言列表)
# 标签来自文档「特殊标签」列；方言仅在有明确标注时填写。
_RAW: list[tuple] = [
    # ---- 一、通用/角色/视频等场景（zh_*/en_*_uranus_bigtts）----
    ("zh_female_vv_uranus_bigtts", "Vivi 2.0", "女", "zh-cn", "通用场景", ["指令遵循"], ["粤语", "上海", "河南", "北京", "天津", "四川", "陕西", "东北"]),
    ("zh_female_xiaohe_uranus_bigtts", "小何 2.0", "女", "zh-cn", "通用场景", ["指令遵循"], ["粤语", "上海", "河南", "北京", "天津", "四川", "陕西", "东北"]),
    ("zh_male_m191_uranus_bigtts", "云舟 2.0", "男", "zh-cn", "通用场景", ["指令遵循"], ["粤语", "上海", "河南", "北京", "天津", "四川", "陕西", "东北"]),
    ("zh_male_taocheng_uranus_bigtts", "小天 2.0", "男", "zh-cn", "通用场景", ["指令遵循"], ["粤语", "上海", "河南", "北京", "天津", "四川", "陕西", "东北"]),
    ("zh_male_liufei_uranus_bigtts", "刘飞 2.0", "男", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_female_sophie_uranus_bigtts", "魅力苏菲 2.0", "女", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_female_qingxinnvsheng_uranus_bigtts", "清新女声 2.0", "女", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_female_cancan_uranus_bigtts", "知性灿灿 2.0", "女", "zh-cn", "角色扮演", ["指令遵循"], []),
    ("zh_female_sajiaoxuemei_uranus_bigtts", "撒娇学妹 2.0", "女", "zh-cn", "角色扮演", ["指令遵循"], []),
    ("zh_female_tianmeixiaoyuan_uranus_bigtts", "甜美小源 2.0", "女", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_female_tianmeitaozi_uranus_bigtts", "甜美桃子 2.0", "女", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_female_shuangkuaisisi_uranus_bigtts", "爽快思思 2.0", "女", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_female_peiqi_uranus_bigtts", "佩奇猪 2.0", "女", "zh-cn", "视频配音", ["抖音同款", "豆包同款", "剪映同款"], []),
    ("zh_female_linjianvhai_uranus_bigtts", "邻家女孩 2.0", "女", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_male_shaonianzixin_uranus_bigtts", "少年梓辛 2.0", "男", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_male_sunwukong_uranus_bigtts", "猴哥 2.0", "男", "zh-cn", "视频配音", ["指令遵循"], []),
    ("zh_female_yingyujiaoxue_uranus_bigtts", "Tina老师 2.0", "女", "zh-cn", "教育场景", ["指令遵循"], []),
    ("zh_female_kefunvsheng_uranus_bigtts", "暖阳女声 2.0", "女", "zh-cn", "客服场景", ["指令遵循"], []),
    ("zh_female_xiaoxue_uranus_bigtts", "儿童绘本 2.0", "女", "zh-cn", "有声阅读", ["指令遵循"], []),
    ("zh_male_dayi_uranus_bigtts", "大壹 2.0", "男", "zh-cn", "视频配音", ["指令遵循"], []),
    ("zh_female_mizai_uranus_bigtts", "黑猫侦探社咪仔 2.0", "女", "zh-cn", "视频配音", ["指令遵循"], []),
    ("zh_female_jitangnv_uranus_bigtts", "鸡汤女 2.0", "女", "zh-cn", "视频配音", ["指令遵循"], []),
    ("zh_female_meilinvyou_uranus_bigtts", "魅力女友 2.0", "女", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_female_liuchangnv_uranus_bigtts", "流畅女声 2.0", "女", "zh-cn", "视频配音", ["指令遵循"], []),
    ("zh_male_ruyayichen_uranus_bigtts", "儒雅逸辰 2.0", "男", "zh-cn", "视频配音", ["指令遵循"], []),
    ("en_male_tim_uranus_bigtts", "Tim", "男", "en", "多语种", ["指令遵循"], []),
    ("en_female_dacey_uranus_bigtts", "Dacey", "女", "en", "多语种", ["指令遵循"], []),
    ("en_female_stokie_uranus_bigtts", "Stokie", "女", "en", "多语种", ["指令遵循"], []),
    ("zh_female_wenroumama_uranus_bigtts", "温柔妈妈 2.0", "女", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_male_jieshuoxiaoming_uranus_bigtts", "解说小明 2.0", "男", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_female_tvbnv_uranus_bigtts", "TVB女声 2.0", "女", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_male_yizhipiannan_uranus_bigtts", "译制片男 2.0", "男", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_female_qiaopinv_uranus_bigtts", "俏皮女声 2.0", "女", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_female_zhishuaiyingzi_uranus_bigtts", "直率英子 2.0", "女", "zh-cn", "角色扮演", ["抖音同款", "豆包同款", "剪映同款"], []),
    ("zh_male_linjiananhai_uranus_bigtts", "邻家男孩 2.0", "男", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_male_silang_uranus_bigtts", "四郎 2.0", "男", "zh-cn", "角色扮演", ["抖音同款", "豆包同款", "剪映同款"], []),
    ("zh_male_ruyaqingnian_uranus_bigtts", "儒雅青年 2.0", "男", "zh-cn", "通用场景", ["番茄小说同款", "豆包同款", "剪映同款"], []),
    ("zh_male_qingcang_uranus_bigtts", "擎苍 2.0", "男", "zh-cn", "角色扮演", ["番茄小说同款", "豆包同款", "抖音同款", "剪映同款"], []),
    ("zh_male_xionger_uranus_bigtts", "熊二 2.0", "男", "zh-cn", "角色扮演", ["抖音同款", "豆包同款", "剪映同款"], []),
    ("zh_female_yingtaowanzi_uranus_bigtts", "樱桃丸子 2.0", "女", "zh-cn", "角色扮演", ["抖音同款", "豆包同款", "剪映同款"], []),
    ("zh_male_wennuanahu_uranus_bigtts", "温暖阿虎 2.0", "男", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_male_naiqimengwa_uranus_bigtts", "奶气萌娃 2.0", "男", "zh-cn", "通用场景", ["剪映同款", "豆包同款"], []),
    ("zh_female_popo_uranus_bigtts", "婆婆 2.0", "女", "zh-cn", "通用场景", ["抖音同款", "豆包同款", "剪映同款"], []),
    ("zh_female_gaolengyujie_uranus_bigtts", "高冷御姐 2.0", "女", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_male_aojiaobazong_uranus_bigtts", "傲娇霸总 2.0", "男", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_male_lanyinmianbao_uranus_bigtts", "懒音绵宝 2.0", "男", "zh-cn", "角色扮演", ["指令遵循"], []),
    ("zh_male_fanjuanqingnian_uranus_bigtts", "反卷青年 2.0", "男", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_female_wenroushunv_uranus_bigtts", "温柔淑女 2.0", "女", "zh-cn", "通用场景", ["番茄小说同款", "豆包同款", "剪映同款"], []),
    ("zh_female_gufengshaoyu_uranus_bigtts", "古风少御 2.0", "女", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_male_huolixiaoge_uranus_bigtts", "活力小哥 2.0", "男", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_male_baqiqingshu_uranus_bigtts", "霸气青叔 2.0", "男", "zh-cn", "有声阅读", ["番茄小说同款", "豆包同款", "剪映同款"], []),
    ("zh_male_xuanyijieshuo_uranus_bigtts", "悬疑解说 2.0", "男", "zh-cn", "有声阅读", ["抖音同款", "豆包同款", "剪映同款"], []),
    ("zh_female_mengyatou_uranus_bigtts", "萌丫头 2.0", "女", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_female_tiexinnvsheng_uranus_bigtts", "贴心女声 2.0", "女", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_female_jitangmei_uranus_bigtts", "鸡汤妹妹 2.0", "女", "zh-cn", "通用场景", ["抖音同款", "豆包同款"], []),
    ("zh_male_cixingjieshuonan_uranus_bigtts", "磁性解说男声 2.0", "男", "zh-cn", "通用场景", ["抖音同款", "剪映同款"], []),
    ("zh_male_liangsangmengzai_uranus_bigtts", "亮嗓萌仔 2.0", "男", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_female_kailangjiejie_uranus_bigtts", "开朗姐姐 2.0", "女", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_male_gaolengchenwen_uranus_bigtts", "高冷沉稳 2.0", "男", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_male_shenyeboke_uranus_bigtts", "深夜播客 2.0", "男", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_male_lubanqihao_uranus_bigtts", "鲁班七号 2.0", "男", "zh-cn", "角色扮演", ["抖音同款", "豆包同款", "剪映同款"], []),
    ("zh_female_jiaochuannv_uranus_bigtts", "娇喘女声 2.0", "女", "zh-cn", "通用场景", ["抖音同款", "剪映同款"], []),
    ("zh_female_linxiao_uranus_bigtts", "林潇 2.0", "女", "zh-cn", "角色扮演", ["抖音同款", "豆包同款", "剪映同款"], []),
    ("zh_female_lingling_uranus_bigtts", "玲玲姐姐 2.0", "女", "zh-cn", "角色扮演", ["抖音同款", "豆包同款", "剪映同款"], []),
    ("zh_female_chunribu_uranus_bigtts", "春日部姐姐 2.0", "女", "zh-cn", "角色扮演", ["抖音同款", "豆包同款", "剪映同款"], []),
    ("zh_male_tangseng_uranus_bigtts", "唐僧 2.0", "男", "zh-cn", "角色扮演", ["抖音同款", "豆包同款"], []),
    ("zh_male_zhuangzhou_uranus_bigtts", "庄周 2.0", "男", "zh-cn", "角色扮演", ["抖音同款", "剪映同款"], []),
    ("zh_male_kailangdidi_uranus_bigtts", "开朗弟弟 2.0", "男", "zh-cn", "通用场景", ["抖音同款", "剪映同款"], []),
    ("zh_male_zhubajie_uranus_bigtts", "猪八戒 2.0", "男", "zh-cn", "角色扮演", ["豆包同款", "剪映同款"], []),
    ("zh_female_ganmaodianyin_uranus_bigtts", "感冒电音姐姐 2.0", "女", "zh-cn", "角色扮演", ["抖音同款", "剪映同款"], []),
    ("zh_female_chanmeinv_uranus_bigtts", "谄媚女声 2.0", "女", "zh-cn", "通用场景", ["抖音同款", "剪映同款"], []),
    ("zh_female_nvleishen_uranus_bigtts", "女雷神 2.0", "女", "zh-cn", "通用场景", ["剪映同款", "豆包同款"], []),
    ("zh_female_qinqienv_uranus_bigtts", "亲切女声 2.0", "女", "zh-cn", "通用场景", ["豆包同款"], []),
    ("zh_male_kuailexiaodong_uranus_bigtts", "快乐小东 2.0", "男", "zh-cn", "通用场景", ["豆包同款"], []),
    ("zh_male_kailangxuezhang_uranus_bigtts", "开朗学长 2.0", "男", "zh-cn", "通用场景", ["豆包同款"], []),
    ("zh_male_youyoujunzi_uranus_bigtts", "悠悠君子 2.0", "男", "zh-cn", "通用场景", ["豆包同款"], []),
    ("zh_female_wenjingmaomao_uranus_bigtts", "文静毛毛 2.0", "女", "zh-cn", "通用场景", ["豆包同款"], []),
    ("zh_female_zhixingnv_uranus_bigtts", "知性女声 2.0", "女", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_male_qingshuangnanda_uranus_bigtts", "清爽男大 2.0", "男", "zh-cn", "通用场景", ["豆包同款"], []),
    ("zh_male_yuanboxiaoshu_uranus_bigtts", "渊博小叔 2.0", "男", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_male_yangguangqingnian_uranus_bigtts", "阳光青年 2.0", "男", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_female_qingchezizi_uranus_bigtts", "清澈梓梓 2.0", "女", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_female_tianmeiyueyue_uranus_bigtts", "甜美悦悦 2.0", "女", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_female_xinlingjitang_uranus_bigtts", "心灵鸡汤 2.0", "女", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_male_wenrouxiaoge_uranus_bigtts", "温柔小哥 2.0", "男", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_female_roumeinvyou_uranus_bigtts", "柔美女友 2.0", "女", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_male_dongfanghaoran_uranus_bigtts", "东方浩然 2.0", "男", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_female_wenrouxiaoya_uranus_bigtts", "温柔小雅 2.0", "女", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_male_tiancaitongsheng_uranus_bigtts", "天才童声 2.0", "男", "zh-cn", "通用场景", ["指令遵循"], []),
    ("zh_female_wuzetian_uranus_bigtts", "武则天 2.0", "女", "zh-cn", "角色扮演", ["剪映同款"], []),
    ("zh_female_guji_uranus_bigtts", "顾姐 2.0", "女", "zh-cn", "角色扮演", ["抖音同款", "剪映同款"], []),
    ("zh_male_guanggaojieshuo_uranus_bigtts", "广告解说 2.0", "男", "zh-cn", "通用场景", ["剪映同款"], []),
    ("zh_female_shaoergushi_uranus_bigtts", "少儿故事 2.0", "女", "zh-cn", "有声阅读", ["指令遵循"], []),
    # ---- 二、多语种英文 ICL 音色（ICL_uranus_en_*_tob）----
    ("ICL_uranus_en_female_charlie_tob", "Charlie 2.0", "女", "en", "多语种", [], []),
    ("ICL_uranus_en_male_ethan_tob", "Ethan 2.0", "男", "en", "多语种", [], []),
    ("ICL_uranus_en_male_alastor_tob", "Alastor 2.0", "男", "en", "多语种", [], []),
    ("ICL_uranus_en_male_chucky_tob", "Chucky 2.0", "男", "en", "多语种", [], []),
    ("ICL_uranus_en_male_noah_tob", "Noah 2.0", "男", "en", "多语种", [], []),
    ("ICL_uranus_en_male_jigsaw_tob", "Jigsaw 2.0", "男", "en", "多语种", [], []),
    ("ICL_uranus_en_male_clown_man_tob", "Clown Man 2.0", "男", "en", "多语种", ["豆包同款"], []),
    ("ICL_uranus_en_male_frosty_man_tob", "Frosty Man 2.0", "男", "en", "多语种", ["豆包同款"], []),
    ("ICL_uranus_en_male_the_grinch_tob", "The Grinch 2.0", "男", "en", "多语种", ["豆包同款"], []),
    ("ICL_uranus_en_male_kevin_mccallister_tob", "Kevin McCallister 2.0", "男", "en", "多语种", ["豆包同款"], []),
    ("ICL_uranus_en_male_michael_tob", "Michael 2.0", "男", "en", "多语种", ["豆包同款"], []),
    ("ICL_uranus_en_male_big_boogie_tob", "Big Boogie 2.0", "男", "en", "多语种", ["豆包同款"], []),
    ("ICL_uranus_en_male_xavier_tob", "Xavier 2.0", "男", "en", "多语种", [], []),
    ("ICL_uranus_en_male_zayne_tob", "Zayne 2.0", "男", "en", "多语种", [], []),
    # ---- 三、客服/角色/通用中文 ICL 音色（ICL_uranus_zh_*_tob）----
    ("ICL_uranus_zh_female_kefuwanjun_tob", "客服婉君 2.0", "女", "zh-cn", "客服场景", [], []),
    ("ICL_uranus_zh_female_yingxiaokefu_v2_tob", "营销小楠 2.0", "女", "zh-cn", "客服场景", [], []),
    ("ICL_uranus_zh_female_aojiaonvyou_tob", "傲娇女友 2.0", "女", "zh-cn", "角色扮演", ["豆包同款", "猫箱同款"], []),
    ("ICL_uranus_zh_female_aomanjiaosheng_tob", "傲慢娇声 2.0", "女", "zh-cn", "角色扮演", ["猫箱同款"], []),
    ("ICL_uranus_zh_female_xiemeinvwang_tob", "邪魅女王 2.0", "女", "zh-cn", "角色扮演", [], []),
    ("ICL_uranus_zh_female_bingjiaojiejie_tob", "病娇姐姐 2.0", "女", "zh-cn", "角色扮演", ["豆包同款", "猫箱同款"], []),
    ("ICL_uranus_zh_female_bingjiaomengmei_tob", "病娇萌妹 2.0", "女", "zh-cn", "角色扮演", ["猫箱同款"], []),
    ("ICL_uranus_zh_female_bingruoshaonv_tob", "病弱少女 2.0", "女", "zh-cn", "角色扮演", [], []),
    ("ICL_uranus_zh_female_chengshuwenrou_tob", "成熟温柔 2.0", "女", "zh-cn", "角色扮演", ["猫箱同款"], []),
    ("ICL_uranus_zh_female_chengshujiejie_tob", "成熟姐姐 2.0", "女", "zh-cn", "角色扮演", ["豆包同款", "猫箱同款"], []),
    ("ICL_uranus_zh_female_chunzhenshaonv_tob", "纯真少女 2.0", "女", "zh-cn", "角色扮演", ["豆包同款"], []),
    ("ICL_uranus_zh_female_chunchenvsheng_tob", "纯澈女生 2.0", "女", "zh-cn", "通用场景", [], []),
    ("ICL_uranus_zh_female_wumeikeren_tob", "妩媚可人 2.0", "女", "zh-cn", "角色扮演", [], []),
    ("ICL_uranus_zh_female_guaiqiaokeer_tob", "乖巧可儿 2.0", "女", "zh-cn", "客服场景", [], []),
    ("ICL_uranus_zh_female_heainainai_tob", "和蔼奶奶 2.0", "女", "zh-cn", "视频配音", [], []),
    ("ICL_uranus_zh_female_huopodiaoman_tob", "活泼刁蛮 2.0", "女", "zh-cn", "角色扮演", ["猫箱同款"], []),
    ("ICL_uranus_zh_female_huoponvhai_tob", "活泼女孩 2.0", "女", "zh-cn", "角色扮演", [], []),
    ("ICL_uranus_zh_female_jiaohannvwang_tob", "娇憨女王 2.0", "女", "zh-cn", "角色扮演", ["猫箱同款"], []),
    ("ICL_uranus_zh_female_jiaoruoluoli_tob", "娇弱萝莉 2.0", "女", "zh-cn", "角色扮演", ["猫箱同款"], []),
    ("ICL_uranus_zh_female_jiaxiaozi_tob", "假小子 2.0", "女", "zh-cn", "角色扮演", ["豆包同款", "猫箱同款"], []),
    ("ICL_uranus_zh_female_jinglingxiangdao_tob", "精灵向导 2.0", "女", "zh-cn", "角色扮演", ["豆包同款"], []),
    ("ICL_uranus_zh_female_kailangtingting_tob", "开朗婷婷 2.0", "女", "zh-cn", "客服场景", [], []),
    ("ICL_uranus_zh_female_kaixinxiaohong_tob", "开心小鸿 2.0", "女", "zh-cn", "客服场景", [], []),
    ("ICL_uranus_zh_female_keainvsheng_tob", "可爱女生 2.0", "女", "zh-cn", "角色扮演", ["猫箱同款"], []),
    ("ICL_uranus_zh_female_lingdongxinxin_tob", "灵动欣欣 2.0", "女", "zh-cn", "客服场景", [], []),
    ("ICL_uranus_zh_female_linjuayi_tob", "邻居阿姨 2.0", "女", "zh-cn", "视频配音", [], []),
    ("ICL_uranus_zh_female_tianmeijiaoqiao_tob", "甜美娇俏 2.0", "女", "zh-cn", "角色扮演", ["猫箱同款"], []),
    ("ICL_uranus_zh_female_qinglenggaoya_tob", "清冷高雅 2.0", "女", "zh-cn", "角色扮演", ["猫箱同款"], []),
    ("ICL_uranus_zh_female_lixingyuanzi_tob", "理性圆子 2.0", "女", "zh-cn", "客服场景", [], []),
    ("ICL_uranus_zh_female_xingganmeihuo_tob", "性感魅惑 2.0", "女", "zh-cn", "角色扮演", [], []),
    ("ICL_uranus_zh_female_nuanxinqianqian_tob", "暖心茜茜 2.0", "女", "zh-cn", "客服场景", [], []),
    ("ICL_uranus_zh_female_nuanxinxuejie_tob", "暖心学姐 2.0", "女", "zh-cn", "角色扮演", ["猫箱同款"], []),
    ("ICL_uranus_zh_female_qingtianmeimei_tob", "清甜莓莓 2.0", "女", "zh-cn", "客服场景", [], []),
    ("ICL_uranus_zh_female_qingtiantaotao_tob", "清甜桃桃 2.0", "女", "zh-cn", "客服场景", [], []),
    ("ICL_uranus_zh_female_qingxixiaoxue_tob", "清晰小雪 2.0", "女", "zh-cn", "客服场景", [], []),
    ("ICL_uranus_zh_female_qingxinshaonv_tob", "倾心少女 2.0", "女", "zh-cn", "视频配音", [], []),
    ("ICL_uranus_zh_female_rouguhunshi_tob", "柔骨魂师 2.0", "女", "zh-cn", "角色扮演", ["猫箱同款"], []),
    ("ICL_uranus_zh_female_ruanmengtangtang_tob", "软萌糖糖 2.0", "女", "zh-cn", "客服场景", [], []),
    ("ICL_uranus_zh_female_ruanmengtuanzi_tob", "软萌团子 2.0", "女", "zh-cn", "客服场景", [], []),
    ("ICL_uranus_zh_female_tianmeihuopo_tob", "甜美活泼 2.0", "女", "zh-cn", "角色扮演", ["猫箱同款"], []),
    ("ICL_uranus_zh_female_tianmeixiaoju_tob", "甜美小橘 2.0", "女", "zh-cn", "客服场景", [], []),
    ("ICL_uranus_zh_female_tianmeixiaoyu_tob", "甜美小雨 2.0", "女", "zh-cn", "客服场景", [], []),
    ("ICL_uranus_zh_female_tiaopigongzhu_tob", "调皮公主 2.0", "女", "zh-cn", "角色扮演", ["猫箱同款"], []),
    ("ICL_uranus_zh_female_tiexinguimi_tob", "贴心闺蜜 2.0", "女", "zh-cn", "通用场景", [], []),
    ("ICL_uranus_zh_female_tiexinmeimei_tob", "贴心妹妹 2.0", "女", "zh-cn", "通用场景", [], []),
    ("ICL_uranus_zh_female_wenrounvshen_tob", "温柔女神 2.0", "女", "zh-cn", "通用场景", ["豆包同款"], []),
    ("ICL_uranus_zh_female_wenrouwenya_tob", "温柔文雅 2.0", "女", "zh-cn", "通用场景", ["猫箱同款"], []),
    ("ICL_uranus_zh_female_zhixinjiejie_tob", "知心姐姐 2.0", "女", "zh-cn", "通用场景", [], []),
    ("ICL_uranus_zh_female_wumeiyujie_tob", "妩媚御姐 2.0", "女", "zh-cn", "角色扮演", ["豆包同款"], []),
    ("ICL_uranus_zh_female_yuanqitianmei_tob", "元气甜妹 2.0", "女", "zh-cn", "通用场景", [], []),
    ("ICL_uranus_zh_female_xiemeiyujie_tob", "邪魅御姐 2.0", "女", "zh-cn", "角色扮演", [], []),
    ("ICL_uranus_zh_female_xingganyujie_tob", "性感御姐 2.0", "女", "zh-cn", "角色扮演", ["豆包同款", "猫箱同款"], []),
    ("ICL_uranus_zh_female_xiuliqianqian_tob", "秀丽倩倩 2.0", "女", "zh-cn", "客服场景", [], []),
    ("ICL_uranus_zh_female_wenroubaiyueguang_tob", "温柔白月光 2.0", "女", "zh-cn", "通用场景", [], []),
    ("ICL_uranus_zh_female_chuliannvyou_tob", "初恋女友 2.0", "女", "zh-cn", "通用场景", [], []),
    ("ICL_uranus_zh_female_zhixingwenwan_tob", "知性温婉 2.0", "女", "zh-cn", "通用场景", ["猫箱同款"], []),
    ("ICL_uranus_zh_female_aoqilingren_tob", "傲气凌人 2.0", "男", "zh-cn", "角色扮演", ["猫箱同款"], []),
    ("ICL_uranus_zh_female_anrenqinzhu_tob", "黯刃秦主 2.0", "男", "zh-cn", "角色扮演", ["豆包同款"], []),
    ("ICL_uranus_zh_female_aojiaogongzi_tob", "傲娇公子 2.0", "男", "zh-cn", "角色扮演", [], []),
    ("ICL_uranus_zh_female_aojiaojingying_tob", "傲娇精英 2.0", "男", "zh-cn", "角色扮演", [], []),
    ("ICL_uranus_zh_female_aomanqingnian_tob", "傲慢青年 2.0", "男", "zh-cn", "角色扮演", [], []),
    ("ICL_uranus_zh_female_aomanshaoye_tob", "傲慢少爷 2.0", "男", "zh-cn", "角色扮演", ["豆包同款", "猫箱同款"], []),
    ("ICL_uranus_zh_female_zhenbiandiyu_tob", "枕边低语 2.0", "男", "zh-cn", "角色扮演", ["抖音同款"], []),
    ("ICL_uranus_zh_female_badaoshaoye_tob", "霸道少爷 2.0", "男", "zh-cn", "角色扮演", [], []),
    ("ICL_uranus_zh_female_badaozongcai_tob", "霸道总裁 2.0", "男", "zh-cn", "角色扮演", [], []),
    ("ICL_uranus_zh_female_bingjiaobailian_tob", "病娇白莲 2.0", "男", "zh-cn", "角色扮演", ["猫箱同款"], []),
    ("ICL_uranus_zh_female_bingjiaodidi_tob", "病娇弟弟 2.0", "男", "zh-cn", "角色扮演", ["豆包同款", "猫箱同款"], []),
    ("ICL_uranus_zh_female_bingjiaogege_tob", "病娇哥哥 2.0", "男", "zh-cn", "角色扮演", ["豆包同款", "猫箱同款"], []),
    ("ICL_uranus_zh_female_bingjiaonanyou_tob", "病娇男友 2.0", "男", "zh-cn", "角色扮演", [], []),
    ("ICL_uranus_zh_female_bingjiaoshaonian_tob", "病娇少年 2.0", "男", "zh-cn", "角色扮演", [], []),
    ("ICL_uranus_zh_female_bingruogongzi_tob", "病弱公子 2.0", "男", "zh-cn", "角色扮演", ["豆包同款"], []),
    ("ICL_uranus_zh_female_bingruoshaonian_tob", "病弱少年 2.0", "男", "zh-cn", "角色扮演", [], []),
    ("ICL_uranus_zh_female_bujiqingnian_tob", "不羁青年 2.0", "男", "zh-cn", "角色扮演", [], []),
    ("ICL_uranus_zh_female_chunhoudiyin_tob", "醇厚低音 2.0", "男", "zh-cn", "视频配音", [], []),
    ("ICL_uranus_zh_female_paoxiaoxiaoge_tob", "咆哮小哥 2.0", "男", "zh-cn", "视频配音", [], []),
    ("ICL_uranus_zh_female_yangyang_tob", "炀炀 2.0", "男", "zh-cn", "通用场景", [], []),
    ("ICL_uranus_zh_female_chanruoshaoye_tob", "孱弱少爷 2.0", "男", "zh-cn", "角色扮演", [], []),
    ("ICL_uranus_zh_female_chengshuzongcai_tob", "成熟总裁 2.0", "男", "zh-cn", "角色扮演", ["猫箱同款"], []),
    ("ICL_uranus_zh_female_chenwenmingzai_tob", "沉稳明仔 2.0", "男", "zh-cn", "客服场景", [], []),
    ("ICL_uranus_zh_female_qingyisugan_tob", "清逸苏感 2.0", "男", "zh-cn", "角色扮演", ["猫箱同款"], []),
    ("ICL_uranus_zh_female_chunzhenxuedi_tob", "纯真学弟 2.0", "男", "zh-cn", "角色扮演", ["豆包同款", "猫箱同款"], []),
    ("ICL_uranus_zh_female_cixingnansang_tob", "磁性男嗓 2.0", "男", "zh-cn", "角色扮演", [], []),
    ("ICL_uranus_zh_female_cujingnansheng_tob", "醋精男生 2.0", "男", "zh-cn", "角色扮演", [], []),
    ("ICL_uranus_zh_female_cujingnanyou_tob", "醋精男友 2.0", "男", "zh-cn", "角色扮演", [], []),
    ("ICL_uranus_zh_female_diyinchenyu_tob", "低音沉郁 2.0", "男", "zh-cn", "角色扮演", [], []),
    ("ICL_uranus_zh_female_fengfashaonian_tob", "风发少年 2.0", "男", "zh-cn", "角色扮演", [], []),
    ("ICL_uranus_zh_female_ruyagongzi_tob", "儒雅公子 2.0", "男", "zh-cn", "有声阅读", [], []),
]


def all_voices() -> list[dict]:
    """返回完整音色清单（官方文档全部 2.0 预设音色）。"""
    voices: list[dict] = []
    for index, row in enumerate(_RAW):
        voice_type, name, gender, language, scene, tags, dialects = row
        voices.append(
            {
                "voice_type": voice_type,
                "name": name,
                "gender": gender,
                "language": language,
                "scene": scene,
                "tags": list(tags),
                "dialects": list(dialects),
                "resource_id": RESOURCE_ID,
                "voice_kind": "preset",
                "provider": "doubao",
                # sortOrder：官方列表顺序
                "sort_order": index,
            }
        )
    return voices


def total_count() -> int:
    return len(_RAW)


if __name__ == "__main__":
    vs = all_voices()
    print(f"total={len(vs)}")
    # 去重校验
    ids = [v["voice_type"] for v in vs]
    print(f"unique={len(set(ids))}")
    assert len(ids) == len(set(ids)), "voice_type 存在重复！"
    print("OK")
