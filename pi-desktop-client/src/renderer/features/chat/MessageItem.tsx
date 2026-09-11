import { Bot, CircleAlert, UserRound } from "lucide-react";
import type { AgentMessage } from "../../../shared/contracts/agent-events";
import { ThinkingBlock } from "../agent/ThinkingBlock";
import { MarkdownContent } from "./MarkdownContent";

type MessageItemProps = {
  message: AgentMessage;
  hideThinking?: boolean;
};

function formatTokenCount(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
}

export function MessageItem({ message, hideThinking = false }: MessageItemProps) {
  const textBlocks = message.content.filter((block) => block.type === "text");
  const thinkingBlocks = message.content.filter((block) => block.type === "thinking");

  if (message.role === "user") {
    return (
      <article className="timeline-message user-message">
        <div className="message-avatar user"><UserRound size={15} /></div>
        <div className="message-column">
          <div className="message-meta"><strong>你</strong></div>
          <div className="user-message-bubble">
            {textBlocks.map((block) => <p key={block.contentIndex}>{block.text}</p>)}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="timeline-message assistant-message">
      <div className="message-avatar assistant"><Bot size={16} /></div>
      <div className="message-column">
        <div className="message-meta">
          <strong>Pi</strong>
          {message.model && <span>{message.model}</span>}
          {message.streaming && <span className="streaming-label"><i />生成中</span>}
        </div>
        {!hideThinking && thinkingBlocks.map((block) => (
          <ThinkingBlock
            key={block.contentIndex}
            text={block.text}
            streaming={message.streaming}
            redacted={block.redacted}
          />
        ))}
        <div className="assistant-copy">
          {textBlocks.length === 0 && message.streaming ? (
            <span className="typing-indicator"><i /><i /><i /></span>
          ) : (
            textBlocks.map((block) => message.streaming
              ? <p key={block.contentIndex}>{block.text}</p>
              : <MarkdownContent content={block.text} key={block.contentIndex} />)
          )}
          {message.errorMessage && (
            <div className="message-error"><CircleAlert size={14} />{message.errorMessage}</div>
          )}
        </div>
        {!message.streaming && message.usage && (
          <div className="message-footer">{formatTokenCount(message.usage.totalTokens)} tokens</div>
        )}
      </div>
    </article>
  );
}
