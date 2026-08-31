# Enterprise Data Separation Report

Date: 2026-08-31

## Objective

Separate the Zhiheng Zhiqi product project from customer-specific enterprise assets for Henan Haoming Beverage.

## Product Directory

- Product project path: `D:\知衡智企`
- Intended contents: product source code, common tooling, generic renderer/agent/voice service capabilities, scripts, migrations, tests, and technical documentation.

## Enterprise Directory

- Enterprise root path: `D:\知衡智企数据库\企业知识库\浩明饮品`
- Intended contents: Haoming-specific knowledge, source materials, video assets, content knowledge, samples, and enterprise-specific business data.

## Moved Directories

| Source path | Target path | Files | Bytes |
|---|---|---:|---:|
| `D:\知衡智企\浩明饮品知识库` | `D:\知衡智企数据库\企业知识库\浩明饮品\知识库` | 186 | 797198723 |
| `D:\知衡智企数据库\素材资源` | `D:\知衡智企数据库\企业知识库\浩明饮品\素材资源\视频` | 102 | 2985773370 |
| `D:\知衡智企数据库\知识文件` | `D:\知衡智企数据库\企业知识库\浩明饮品\内容资料\知识文件` | 15 | 134372 |

Total moved files: 303

Total moved bytes: 3783106465

## Preserved Product/Data Items

- `D:\知衡智企\src`, `scripts`, `services`, `engines`, `drizzle`, `tests`, `bin`: product and development assets, retained.
- `D:\知衡智企数据库\包装素材库`: generic packaging asset candidate library for renderer testing, retained outside the customer enterprise directory.
- `D:\知衡智企数据库\产品资料`: demo product data, retained.
- `D:\知衡智企数据库\客户资料`: demo customer data, retained.
- `D:\知衡智企数据库\声音资产` and `D:\知衡智企数据库\视频文件`: current shared data buckets, retained.

## Path References Updated

Local development database `storage_configs` was updated:

- `assets`: `D:\知衡智企数据库\企业知识库\浩明饮品\素材资源\视频`
- `knowledge`: `D:\知衡智企数据库\企业知识库\浩明饮品\内容资料\知识文件`

Development scripts and technical documents were updated from old absolute paths to the new enterprise paths. These updates only change path references; business logic was not refactored.

## Ownership Questions

- `D:\知衡智企数据库\客户资料` contains demo customer records, including a fake Haoming demo record. It is marked as demo data and was not treated as Haoming's real enterprise asset in this pass.
- `D:\知衡智企数据库\产品资料` contains demo beverage-bottle product data, not real Haoming product assets.
- Some product technical reports and renderer test scripts still mention Haoming as a sample scenario. They remain in the product project because they are product development/test artifacts, not the Obsidian knowledge vault or source enterprise data.

## Git Boundary

No tracked Git files were found under the old Haoming knowledge vault path or the old enterprise material directories before migration.

The migration report itself is a project document. The actual customer enterprise assets are stored outside the product repository boundary under `D:\知衡智企数据库\企业知识库\浩明饮品`.

## Validation

- Old product-side vault path removed: `D:\知衡智企\浩明饮品知识库`
- Old material root removed: `D:\知衡智企数据库\素材资源`
- Old knowledge-file root removed: `D:\知衡智企数据库\知识文件`
- New Obsidian vault contains `.obsidian`
- New knowledge vault file count matches the pre-migration count.
- New material file count and byte count match the pre-migration count.
- New knowledge-file count and byte count match the pre-migration count.
- No real enterprise media files were deleted.

## Risks

- Existing uncommitted product work was present before this migration and remains present.
- Historical technical docs and test scripts still reference Haoming sample wording. This is intentional for now, but future cleanup can replace customer-specific examples with neutral fixtures.
- Any external tools or Obsidian windows that had the old vault path open should be reopened using the new path.

