// SMTP Receiver source connector - settings panel for the web administrator.
// Engine-hosted plugins are loaded as a single blob module, so only bare @oie/*
// imports (resolved through the page's import map) are available. The form
// building blocks come from @oie/web-ui; React comes from the platform object.
import {
  ConnectorForm,
  portsInUseButton,
  listenerAddressField,
  asBool,
  YES_NO,
  requireFields,
  defaultSourceProperties,
  defaultListenerProperties
} from "@oie/web-ui";

const PROPERTIES_CLASS = "com.mirth.connect.connectors.smtpreceiver.shared.SmtpReceiverProperties";
const CONNECTOR_NAME = "SMTP 接收器";

const TLS_OPTIONS = [
  { value: "NONE", label: "无" },
  { value: "STARTTLS", label: "STARTTLS" },
  { value: "IMPLICIT", label: "隐式 TLS (SMTPS)" }
];
const FORMAT_OPTIONS = [
  { value: "RFC822", label: "纯文本 (RFC 822)" },
  { value: "JSON", label: "JSON" },
  { value: "XML", label: "XML" }
];
const KEYSTORE_TYPES = ["PKCS12", "JKS", "JCEKS"];

// Only JSON and XML take the mail apart, so only they have attachments to put in.
const isParsed = (p) => p.messageFormat === "JSON" || p.messageFormat === "XML";
const usesTls = (p) => p.tlsMode === "STARTTLS" || p.tlsMode === "IMPLICIT";

const isNumber = (value, min, max) => {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return false;
  const n = Number(text);
  return n >= min && n <= max;
};

// Mirrors SmtpReceiverProperties.parseUsers: one "username:password" per line, # starts a comment.
export function parseUsers(text) {
  const users = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return;
    const colon = trimmed.indexOf(":");
    if (colon < 1) {
      errors.push(`第 ${i + 1} 行`);
      return;
    }
    users.push({ user: trimmed.slice(0, colon).trim(), password: trimmed.slice(colon + 1).trim() });
  });
  return { users, errors };
}

function smtpAddress(p) {
  const listener = p.listenerConnectorProperties || {};
  const rawHost = String(listener.host ?? "").trim();
  const host = !rawHost || rawHost === "0.0.0.0" ? window.location.hostname : rawHost;
  return `${host}:${listener.port ?? ""}`;
}

export function createSmtpReceiver(platform) {
  return {
    defaults(version) {
      return {
        "@class": PROPERTIES_CLASS,
        "@version": version,
        pluginProperties: null,
        listenerConnectorProperties: defaultListenerProperties(version, "2525"),
        sourceConnectorProperties: defaultSourceProperties(version),
        hostname: "",
        requireAuthentication: true,
        users: "",
        tlsMode: "NONE",
        keystorePath: "",
        keystorePassword: "",
        keyPassword: "",
        keystoreType: "PKCS12",
        maxMessageSize: "25",
        maxConnections: "10",
        maxRecipients: "100",
        timeout: "120",
        messageFormat: "RFC822",
        includeAttachmentContent: true,
        charset: "UTF-8"
      };
    },

    component({ properties, onChange }) {
      // platform.React is set by the shell at boot, so read it at render time.
      const React = platform.React;
      return React.createElement(ConnectorForm, {
        properties,
        onChange,
        fields: [
          { section: "Listener Settings" },
          listenerAddressField("listenerConnectorProperties.host", "Local Address"),
          { key: "listenerConnectorProperties.port", label: "本地端口", type: "number", width: "90px", append: () => portsInUseButton() },
          { type: "display", label: "SMTP 地址", compute: smtpAddress },

          { section: "SMTP Server" },
          { key: "hostname", label: "主机名", type: "text", width: "220px", tooltip: "服务器问候语中的名称。留空：使用本机名称。" },
          {
            key: "requireAuthentication",
            label: "要求登录",
            type: "radio",
            options: YES_NO,
            tooltip: "不要求登录时，仅接受通过身份验证（AUTH PLAIN 或 LOGIN）的客户端的邮件。请仅在受信任的网络上关闭此选项。"
          },
          {
            key: "users",
            label: "用户",
            type: "textarea",
            rows: 4,
            tooltip: "每行一个 用户名:密码。以 # 开头的行将被忽略。密码中可包含冒号。"
          },
          {
            key: "tlsMode",
            label: "TLS",
            type: "select",
            width: "220px",
            options: TLS_OPTIONS,
            refresh: true,
            tooltip: "STARTTLS：客户端升级连接（通常为端口 587 或 25）。隐式 TLS：从第一个字节起即加密（通常为端口 465）。启用 TLS 时，仅接受通过加密连接的登录。"
          },
          { key: "keystorePath", label: "密钥库文件", type: "text", width: "320px", visible: usesTls, tooltip: "包含服务器证书及其私钥的密钥库路径" },
          { key: "keystorePassword", label: "密钥库密码", type: "password", width: "220px", visible: usesTls },
          { key: "keyPassword", label: "密钥密码", type: "password", width: "220px", visible: usesTls, tooltip: "私钥的密码。留空：与密钥库密码相同。" },
          { key: "keystoreType", label: "密钥库类型", type: "select", width: "120px", options: KEYSTORE_TYPES, visible: usesTls },

          { section: "Limits" },
          { key: "maxMessageSize", label: "最大消息大小 (MB)", type: "number", width: "90px", tooltip: "超大的邮件将以 552 拒绝。0 = 无限制。" },
          { key: "maxConnections", label: "最大连接数", type: "number", width: "90px", tooltip: "超过此数量的客户端连接将收到 421 并被要求稍后重试" },
          { key: "maxRecipients", label: "最大收件人数", type: "number", width: "90px", tooltip: "每封邮件" },
          { key: "timeout", label: "超时（秒）", type: "number", width: "90px", tooltip: "客户端保持静默超过此时长将被断开" },

          { section: "消息" },
          {
            key: "messageFormat",
            label: "消息格式",
            type: "select",
            width: "220px",
            options: FORMAT_OPTIONS,
            refresh: true,
            tooltip: "纯文本：邮件原样发送（信头、空行、正文）。JSON 或 XML：将邮件拆分为主题、发件人、收件人、日期、信头、文本、HTML 和附件，以及信封信息。"
          },
          {
            key: "includeAttachmentContent",
            label: "附件内容",
            type: "radio",
            options: YES_NO,
            visible: isParsed,
            tooltip: "将附件本身放入消息中（Base64）。选择“否”时仅列出其名称、类型和大小。"
          },
          { key: "charset", label: "字符集", type: "text", width: "120px", tooltip: "纯文本：邮件字节如何转换为文本，例如 UTF-8 或 ISO-8859-1。JSON 和 XML：用于未指定自身字符集的邮件部分。" }
        ]
      });
    },

    // Mirrors the Swing panel (SmtpReceiverPanel.checkProperties).
    validate(properties) {
      const errors = requireFields(properties, [
        { key: "listenerConnectorProperties.host", label: "本地地址" },
        { key: "listenerConnectorProperties.port", label: "本地端口" },
        { key: "charset", label: "字符集" },
        { key: "keystorePath", label: "密钥库文件", when: usesTls }
      ]);

      const numbers = [
        { key: "listenerConnectorProperties.port", label: "本地端口 (1-65535)", value: properties.listenerConnectorProperties?.port, min: 1, max: 65535, skipTemplates: true },
        { key: "maxMessageSize", label: "最大消息大小 (0-2000)", value: properties.maxMessageSize, min: 0, max: 2000 },
        { key: "maxConnections", label: "最大连接数 (1-10000)", value: properties.maxConnections, min: 1, max: 10000 },
        { key: "maxRecipients", label: "最大收件人数 (1-100000)", value: properties.maxRecipients, min: 1, max: 100000 },
        { key: "timeout", label: "超时 (1-86400)", value: properties.timeout, min: 1, max: 86400 }
      ];
      for (const n of numbers) {
        if (errors.some((e) => e.key === n.key)) continue;
        if (n.skipTemplates && String(n.value ?? "").includes("${")) continue;
        if (!isNumber(n.value, n.min, n.max)) errors.push({ key: n.key, label: n.label });
      }

      const { users, errors: badLines } = parseUsers(properties.users);
      if (badLines.length > 0) {
        errors.push({ key: "users", label: `用户（${badLines.join(", ")}：应为 用户名:密码 格式）` });
      } else if (asBool(properties.requireAuthentication) && users.length === 0) {
        errors.push({ key: "users", label: "用户（要求登录时至少需要一个用户）" });
      }
      return errors;
    }
  };
}

export function register(platform) {
  platform.registerConnectorPanel(CONNECTOR_NAME, "SOURCE", createSmtpReceiver(platform));
}
