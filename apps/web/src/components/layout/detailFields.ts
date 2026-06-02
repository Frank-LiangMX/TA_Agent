/**
 * 详情面板字段配置（Config-Driven）
 *
 * 新增字段只需在对应数组中加一行，不改组件代码。
 * 后端 schema.py 的 to_dict() 需同步返回该字段。
 */

export interface FieldConfig {
  key: string
  label: string
  format: 'number' | 'string' | 'boolean' | 'list' | 'filesize'
  condition?: (data: Record<string, unknown>) => boolean
}

// ===== 模型资产 =====

export const MESH_FIELDS: FieldConfig[] = [
  { key: 'tri_count', label: '三角面', format: 'number' },
  { key: 'vertex_count', label: '顶点数', format: 'number' },
  { key: 'bone_count', label: '骨骼数', format: 'number', condition: (d) => !!d.has_skeleton },
  { key: 'constraint_count', label: '约束数', format: 'number', condition: (d) => !!d.has_skeleton },
  { key: 'has_uv', label: 'UV', format: 'boolean' },
  { key: 'uv_channel_count', label: 'UV 通道', format: 'number', condition: (d) => !!d.has_uv },
  { key: 'material_count', label: '材质数', format: 'number' },
  // 新增字段示例：
  // { key: 'fps', label: '帧率', format: 'number' },
  // { key: 'morph_target_count', label: '变形目标', format: 'number' },
  // { key: 'lod_levels', label: 'LOD 层级', format: 'number' },
]

// ===== 贴图资产 =====

export const TEXTURE_FIELDS: FieldConfig[] = [
  { key: 'count', label: '贴图数', format: 'number' },
  { key: 'max_resolution', label: '最大分辨率', format: 'string' },
  { key: 'formats_used', label: '格式', format: 'list' },
  { key: 'color_spaces', label: '色彩空间', format: 'list' },
]

// ===== 动画资产 =====

export const ANIMATION_FIELDS: FieldConfig[] = [
  { key: 'bone_count', label: '骨骼数', format: 'number' },
  { key: 'has_skeleton', label: '有骨骼', format: 'boolean' },
  // 新增字段示例：
  // { key: 'frame_range', label: '帧范围', format: 'string' },
  // { key: 'fps', label: '帧率', format: 'number' },
  // { key: 'action_count', label: '动作数', format: 'number' },
  // { key: 'has_root_motion', label: '根运动', format: 'boolean' },
]

// ===== 元信息（所有类型共用） =====

export const META_FIELDS: FieldConfig[] = [
  { key: 'naming_compliant', label: '命名合规', format: 'boolean' },
  { key: 'naming_suggestion', label: '建议命名', format: 'string', condition: (d) => !d.naming_compliant },
  { key: 'engine_path', label: '引擎路径', format: 'string' },
]

// ===== AI 分类（推断层） =====

export const CATEGORY_FIELDS: FieldConfig[] = [
  { key: 'category', label: '主分类', format: 'string' },
  { key: 'subcategory', label: '子分类', format: 'string' },
  { key: 'confidence', label: '置信度', format: 'string' },
]

// ===== 视觉属性 =====

export const VISUAL_FIELDS: FieldConfig[] = [
  { key: 'style', label: '风格', format: 'string' },
  { key: 'condition', label: '状态', format: 'string' },
  { key: 'description', label: '描述', format: 'string' },
]
