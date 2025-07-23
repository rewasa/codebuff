import {
  enterSubagentBuffer,
  isInSubagentBufferMode,
} from './subagent'
import { storeSubagentChunk } from '../subagent-storage'
import { yellow, green } from 'picocolors'

/**
 * Mock subagent data for testing the chat UI
 */
function createMockSubagentData() {
  const mockAgentId = 'mock-agent-demo'
  const mockPrompt = 'Create a React component for a user profile card with avatar, name, email, and bio fields. Include proper TypeScript types and responsive design.'
  
  // Create mock agent content
  const mockContent = `I'll help you create a React component for a user profile card. Let me break this down into steps:

1. First, I'll define the TypeScript interfaces
2. Create the main ProfileCard component
3. Add responsive styling with CSS modules
4. Include proper accessibility features

Let's start with the TypeScript types:

\`\`\`typescript
interface UserProfile {
  id: string
  name: string
  email: string
  bio: string
  avatarUrl?: string
}

interface ProfileCardProps {
  user: UserProfile
  className?: string
  onEdit?: () => void
}
\`\`\`

Now I'll create the main component with responsive design:

\`\`\`tsx
import React from 'react'
import styles from './ProfileCard.module.css'

export const ProfileCard: React.FC<ProfileCardProps> = ({ 
  user, 
  className = '', 
  onEdit 
}) => {
  return (
    <div className={\`\${styles.card} \${className}\`}>
      <div className={styles.header}>
        <div className={styles.avatarContainer}>
          {user.avatarUrl ? (
            <img 
              src={user.avatarUrl} 
              alt={\`\${user.name}'s avatar\`}
              className={styles.avatar}
            />
          ) : (
            <div className={styles.avatarPlaceholder}>
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        
        <div className={styles.userInfo}>
          <h2 className={styles.name}>{user.name}</h2>
          <p className={styles.email}>{user.email}</p>
        </div>
        
        {onEdit && (
          <button 
            className={styles.editButton}
            onClick={onEdit}
            aria-label="Edit profile"
          >
            ✏️
          </button>
        )}
      </div>
      
      <div className={styles.bio}>
        <p>{user.bio}</p>
      </div>
    </div>
  )
}
\`\`\`

And here's the responsive CSS:

\`\`\`css
.card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  padding: 24px;
  max-width: 400px;
  margin: 0 auto;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}

.header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}

.avatarContainer {
  flex-shrink: 0;
}

.avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid #e5e7eb;
}

.avatarPlaceholder {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 24px;
  font-weight: bold;
}

.userInfo {
  flex: 1;
  min-width: 0;
}

.name {
  margin: 0 0 4px 0;
  font-size: 20px;
  font-weight: 600;
  color: #1f2937;
  word-wrap: break-word;
}

.email {
  margin: 0;
  color: #6b7280;
  font-size: 14px;
  word-wrap: break-word;
}

.editButton {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: 8px;
  border-radius: 6px;
  transition: background-color 0.2s ease;
}

.editButton:hover {
  background-color: #f3f4f6;
}

.bio {
  color: #374151;
  line-height: 1.6;
  font-size: 14px;
}

.bio p {
  margin: 0;
}

/* Responsive design */
@media (max-width: 480px) {
  .card {
    padding: 16px;
    margin: 0 16px;
  }
  
  .header {
    gap: 12px;
  }
  
  .avatar,
  .avatarPlaceholder {
    width: 48px;
    height: 48px;
  }
  
  .avatarPlaceholder {
    font-size: 18px;
  }
  
  .name {
    font-size: 18px;
  }
}
\`\`\`

This component includes:

✅ **TypeScript types** for type safety
✅ **Responsive design** that works on mobile and desktop
✅ **Accessibility features** with proper ARIA labels
✅ **Fallback avatar** with user's initial when no image provided
✅ **Hover effects** for better user experience
✅ **Flexible props** including optional edit functionality
✅ **CSS modules** for scoped styling

The component is fully reusable and can be easily customized with additional props or styling overrides!`

  // Store the mock content in subagent storage
  storeSubagentChunk({
    agentId: mockAgentId,
    agentType: 'file-picker',
    prompt: mockPrompt,
    chunk: mockContent,
  })

  return mockAgentId
}

/**
 * Handle the /altbuffer command to simulate subagent chat UI
 */
export function handleAltBuffer(rl: any, onExit: () => void) {
  if (isInSubagentBufferMode()) {
    console.log(yellow('Already in subagent buffer mode! Press ESC to exit.'))
    return
  }

  console.log(green('🎭 Entering mock subagent chat UI...'))
  
  // Create mock data and enter the subagent buffer
  const mockAgentId = createMockSubagentData()
  
  enterSubagentBuffer(rl, mockAgentId, () => {
    console.log(green('\nExited mock subagent buffer!'))
    onExit()
  })
}