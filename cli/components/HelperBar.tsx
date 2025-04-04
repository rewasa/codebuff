import React from 'react'
import { Box, Text, Spacer } from 'ink'

interface HelperBarProps {
  leftItems: string[]
  rightItems: string[]
}

const HelperBar: React.FC<HelperBarProps> = ({ leftItems, rightItems }) => {
  return (
    <Box paddingX={1} flexDirection="row" paddingTop={1}>
      {/* Left Items List */}
      <Text dimColor>
        Commands:{' '} {/* Added label back */}
        {leftItems
          .map((item) => <Text key={item} bold>{item}</Text>)
          .reduce<React.ReactNode[]>((acc, curr, index) => {
            if (index === 0) return [curr]
            return [...acc, <Text key={`sep-left-${index}`}> • </Text>, curr]
          }, [])}
      </Text>

      <Spacer />

      {/* Right Items List */}
      <Text dimColor>
        {rightItems
          .map((item) => {
            const parts = item.split(' ')
            const key = parts[0]
            const description = parts.slice(1).join(' ')
            return (
              <Text key={item}>
                <Text bold>{key}</Text> {description}
              </Text>
            )
          })
          .reduce<React.ReactNode[]>((acc, curr, index) => {
            if (index === 0) return [curr]
            return [...acc, <Text key={`sep-right-${index}`}> • </Text>, curr]
          }, [])}
      </Text>
    </Box>
  )
}

export default HelperBar