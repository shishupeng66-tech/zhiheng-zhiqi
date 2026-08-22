import type { InfobarContent } from '@/components/ui/infobar';

export const workspacesInfoContent: InfobarContent = {
  title: '工作空间管理',
  sections: [
    {
      title: '概述',
      description:
        '工作空间页面允许你管理多个工作空间并在它们之间切换。该能力由知衡智企本地账号体系提供，支持企业内的多工作空间隔离管理。你可以查看所有可用的工作空间、创建新的工作空间，并切换当前激活的工作空间。',
      links: []
    },
    {
      title: '创建工作空间',
      description:
        '要创建新的工作空间，点击“创建组织”按钮。系统会提示你输入工作空间名称并配置初始设置。创建完成后，即可切换到新工作空间并开始管理。',
      links: []
    },
    {
      title: '切换工作空间',
      description:
        '点击列表中的某个工作空间即可在它们之间切换。所选工作空间会成为当前激活的上下文，所有相关的功能都会使用该工作空间。',
      links: []
    },
    {
      title: '工作空间特性',
      description:
        '每个工作空间相互独立，拥有自己的团队成员、角色、权限和账单。这样你可以在同一个账户下管理多个项目或团队，同时保持各自的数据与设置相互隔离。',
      links: []
    },
    {
      title: '服务端权限校验',
      description:
        '本应用遵循基于服务端会话的权限校验模式。服务端的权限校验确保用户只能访问其当前激活工作空间下的资源。',
      links: []
    }
  ]
};

export const teamInfoContent: InfobarContent = {
  title: '团队管理',
  sections: [
    {
      title: '概述',
      description:
        '团队管理页面允许你管理当前工作空间的团队，包括成员、角色、安全设置等。该页面由知衡智企本地账号体系提供完整的组织管理功能。',
      links: []
    },
    {
      title: '管理团队成员',
      description:
        '你可以在此页面添加、移除并管理团队成员。通过邮箱邀请新成员、分配角色并控制其访问级别。每个成员可依据角色拥有不同的权限。',
      links: []
    },
    {
      title: '角色与权限',
      description:
        '在员工管理（系统管理）中配置默认角色与权限。角色定义了团队成员在工作空间内可执行的操作。内置角色包括系统管理员（super_admin）、管理层（manager）与普通员工（employee）。',
      links: []
    },
    {
      title: '安全设置',
      description:
        '管理当前工作空间的安全设置，包括认证要求、会话管理与访问控制。这些设置有助于保护组织的数据与资源。',
      links: []
    },
    {
      title: '组织设置',
      description:
        '配置组织的通用设置，例如名称、Logo 及其他工作空间偏好。这些设置作用于整个工作空间，会影响所有团队成员。',
      links: []
    },
    {
      title: '导航 RBAC 系统',
      description:
        '应用内置了基于客户端的导航过滤系统，使用 `useNav` Hook。它支持 `requireOrg`、`permission` 与 `role` 校验以实现即时访问控制。导航项在 `src/config/nav-config.ts` 中通过 `access` 属性配置。',
      links: []
    }
  ]
};

export const billingInfoContent: InfobarContent = {
  title: '账单与套餐',
  sections: [
    {
      title: '概述',
      description:
        '账单页面用于查看企业的订阅与使用额度。当前为本地企业部署版，套餐与额度由系统管理员在后台统一配置，不依赖任何第三方计费平台。',
      links: []
    },
    {
      title: '可用套餐',
      description:
        '套餐与功能由系统管理员在后台配置与开通。常见套餐包括免费版、专业版与团队版，可按需为工作空间分配。',
      links: []
    },
    {
      title: '套餐功能',
      description:
        '每个套餐可包含特定的功能，用于解锁应用内的能力。功能在后台开通后，代码侧按角色与权限进行校验。',
      links: []
    },
    {
      title: '访问控制',
      description:
        '套餐与功能在整个应用中用于访问控制。服务端依据当前用户角色与权限进行校验；客户端依据订阅状态条件渲染内容。',
      links: []
    },
    {
      title: '配置要求',
      description:
        '如需调整订阅或额度，请联系系统管理员。本地部署版不接入外部支付网关，所有计费策略由管理员后台维护。',
      links: []
    }
  ]
};

export const productInfoContent: InfobarContent = {
  title: '产品管理',
  sections: [
    {
      title: '概述',
      description:
        '产品页面允许你管理产品目录。你可以以表格形式查看所有产品，并支持服务端排序、筛选、分页与搜索功能。使用“新增”按钮创建新产品。',
      links: [
        {
          title: '产品管理指南',
          url: '#'
        }
      ]
    },
    {
      title: '添加产品',
      description:
        '要添加新产品，点击页面顶部的“新增”按钮，进入表单填写产品详情，包括名称、描述、价格、分类并上传产品图片。',
      links: [
        {
          title: '添加产品文档',
          url: '#'
        }
      ]
    },
    {
      title: '编辑产品',
      description:
        '点击表格中的产品行即可编辑已有产品，将打开产品编辑表单，可修改任意产品信息。提交表单后更改会自动保存。',
      links: [
        {
          title: '编辑产品指南',
          url: '#'
        }
      ]
    },
    {
      title: '删除产品',
      description:
        '可在产品列表中删除产品。点击对应产品的删除操作，系统会要求你确认删除，随后该产品将从目录中永久移除。',
      links: [
        {
          title: '产品删除策略',
          url: '#'
        }
      ]
    },
    {
      title: '表格功能',
      description:
        '产品表格包含多项强大功能，帮助你高效管理大型产品目录。点击列头排序、使用筛选控件筛选产品、通过分页翻页，并使用搜索功能快速查找产品。',
      links: [
        {
          title: '表格功能文档',
          url: '#'
        },
        {
          title: '排序与筛选指南',
          url: '#'
        }
      ]
    },
    {
      title: '产品字段',
      description:
        '每个产品可包含以下字段：名称（必填）、描述（可选文本）、价格（数值）、分类（用于归类产品）与图片上传（产品照片）。所有字段在创建或更新产品时均可编辑。',
      links: [
        {
          title: '产品字段说明',
          url: '#'
        }
      ]
    }
  ]
};
