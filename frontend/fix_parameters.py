#!/usr/bin/env python3
import sys

# Read the file
with open('/Users/christopherealy/Desktop/code/chat-web-app/frontend/src/lib/agents/creditCardAgent.ts', 'r') as f:
    lines = f.readlines()

# Fix line 1032 (0-indexed: 1031)
if len(lines) > 1031:
    lines[1031] = lines[1031].replace('statementInfo,', 'processableStatementInfo,')

# Fix line 1033 (0-indexed: 1032)  
if len(lines) > 1032:
    lines[1032] = lines[1032].replace('processableStatementInfo', 'query')

# Write the file back
with open('/Users/christopherealy/Desktop/code/chat-web-app/frontend/src/lib/agents/creditCardAgent.ts', 'w') as f:
    f.writelines(lines)

print("Fixed parameter order")
