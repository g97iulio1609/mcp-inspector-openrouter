---
sidebar_position: 9
---

# IInstagramPort

Instagram-specific DOM operations for stories, feed, reels, DMs, and profile.

## Interface

```typescript
interface IInstagramPort {
  // Stories
  viewStory(username: string): Promise<void>;
  nextStory(): Promise<void>;
  previousStory(): Promise<void>;
  replyToStory(message: string): Promise<void>;

  // Feed
  likePost(): Promise<void>;
  unlikePost(): Promise<void>;
  savePost(): Promise<void>;
  unsavePost(): Promise<void>;
  addComment(text: string): Promise<void>;
  scrollFeed(direction: 'up' | 'down'): void;

  // Reels
  likeReel(): Promise<void>;
  commentOnReel(text: string): Promise<void>;
  nextReel(): Promise<void>;
  shareReel(username: string): Promise<void>;

  // DM
  sendDM(username: string, message: string): Promise<void>;
  openConversation(username: string): Promise<void>;

  // Profile & Navigation
  followUser(username: string): Promise<void>;
  unfollowUser(username: string): Promise<void>;
  goToExplore(): Promise<void>;
  goToReels(): Promise<void>;
  goToProfile(username?: string): void;

  // Context
  getCurrentSection(): InstagramSection;
  isOnInstagram(): boolean;
}

type InstagramSection = 'feed' | 'explore' | 'reels' | 'stories' | 'direct' | 'profile' | 'post' | 'unknown';
```

## Security Features

- **Exact hostname matching**: `isInstagram()` uses `===` / `.endsWith()` to reject spoofed domains
- **CSS.escape**: Username sanitization prevents CSS selector injection
- **React-compatible inputs**: Uses native prototype setter to bypass React's value interception
- **Profile pathname verification**: `followUser()` / `unfollowUser()` verify the correct profile is loaded
- **Empty username guard**: `requireUsername()` throws on empty/whitespace-only input
- **Fallback selector safety**: All fallback SVG selectors include `:not()` exclusions
