export interface GameUserDetail {
    data: Data;
    now: number;
    success: boolean;
    [property: string]: any;
}

export interface Data {
    config: Config;
    external_url: string;
    is_bind: boolean;
    list: DataList[];
    next_page: string;
    prev_page: string;
    role_id: string;
    sharing: Sharing;
    show_bind_button: boolean;
    [property: string]: any;
}

export interface Config {
    app_icon: AppIcon;
    banner: Banner;
    font_class: string;
    font_color: string;
    label: Label;
    show_bind_expired_alert: boolean;
    tint: number;
    title: string;
    [property: string]: any;
}

export interface AppIcon {
    color: string;
    height: number;
    medium_url: string;
    original_format: string;
    original_size: number;
    original_url: string;
    small_url: string;
    url: string;
    width: number;
    [property: string]: any;
}

export interface Banner {
    color: string;
    height: number;
    medium_url: string;
    original_format: string;
    original_size: number;
    original_url: string;
    small_url: string;
    url: string;
    width: number;
    [property: string]: any;
}

export interface Label {
    color: string;
    medium_url: string;
    original_format: string;
    original_url: string;
    small_url: string;
    url: string;
    [property: string]: any;
}

export interface DataList {
    basic_module?: BasicModule;
    character_module?: CharacterModule;
    episode_module?: EpisodeModule;
    is_sharing: boolean;
    item_progress?: ItemProgress;
    module_type: number;
    weapon_module?: WeaponModule;
    [property: string]: any;
}

export interface BasicModule {
    avatar: BasicModuleAvatar;
    custom_items: BasicModuleCustomItem[];
    custom_title: string;
    info: Info[];
    name: string;
    role_id: string;
    subtitle: string;
    [property: string]: any;
}

export interface BasicModuleAvatar {
    color: string;
    medium_url: string;
    original_format: string;
    original_url: string;
    small_url: string;
    url: string;
    [property: string]: any;
}

export interface BasicModuleCustomItem {
    is_main: boolean;
    key: string;
    value: string;
    [property: string]: any;
}

export interface Info {
    main_value: string;
    name: string;
    sub_value: string;
    value: string;
    [property: string]: any;
}

export interface CharacterModule {
    custom_title: string;
    list: CharacterModuleList[];
    total: number;
    [property: string]: any;
}

export interface CharacterModuleList {
    grade: string;
    image: PurpleImage;
    level: number;
    name: string;
    talent_level: number;
    [property: string]: any;
}

export interface PurpleImage {
    color: string;
    medium_url: string;
    original_format: string;
    original_url: string;
    small_url: string;
    url: string;
    [property: string]: any;
}

export interface EpisodeModule {
    custom_items: EpisodeModuleCustomItem[];
    custom_title: string;
    [property: string]: any;
}

export interface EpisodeModuleCustomItem {
    is_main: boolean;
    key: string;
    value: string;
    [property: string]: any;
}

export interface ItemProgress {
    custom_title: string;
    list: ItemProgressList[];
    table_tabs: string[];
    total: number;
    [property: string]: any;
}

export interface ItemProgressList {
    avatar: ListAvatar;
    name: string;
    progress: Progress;
    sort: Sort;
    [property: string]: any;
}

export interface ListAvatar {
    color: string;
    medium_url: string;
    original_format: string;
    original_url: string;
    small_url: string;
    url: string;
    [property: string]: any;
}

export interface Progress {
    current: number;
    max: number;
    [property: string]: any;
}

export interface Sort {
    icon: Icon;
    value: string;
    [property: string]: any;
}

export interface Icon {
    color: string;
    medium_url: string;
    original_format: string;
    original_url: string;
    small_url: string;
    url: string;
    [property: string]: any;
}

export interface WeaponModule {
    custom_title: string;
    list: WeaponModuleList[];
    total: number;
    [property: string]: any;
}

export interface WeaponModuleList {
    grade: string;
    image: FluffyImage;
    level: number;
    name: string;
    props: string[];
    rarity: Rarity;
    [property: string]: any;
}

export interface FluffyImage {
    color: string;
    medium_url: string;
    original_format: string;
    original_url: string;
    small_url: string;
    url: string;
    [property: string]: any;
}

export interface Rarity {
    color: string;
    medium_url: string;
    original_format: string;
    original_url: string;
    small_url: string;
    url: string;
    [property: string]: any;
}

export interface Sharing {
    description: string;
    image: null;
    moment_params: MomentParams;
    qr_code: string;
    title: string;
    url: string;
    [property: string]: any;
}

export interface MomentParams {
    app_id: number;
    group_label_id: number;
    hashtag_ids: number[];
    [property: string]: any;
}