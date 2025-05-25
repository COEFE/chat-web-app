#!/usr/bin/env python3

# Read the file
with open('/Users/christopherealy/Desktop/code/chat-web-app/frontend/src/lib/agents/creditCardAgent.ts', 'r') as f:
    content = f.read()

# Split into lines
lines = content.split('\n')

# Print current line 1033 (0-indexed: 1032)
print(f"Line 1033 before: '{lines[1032]}'")

# Fix line 1033 - replace statementInfo, with processableStatementInfo,
if 'statementInfo,' in lines[1032]:
    lines[1032] = lines[1032].replace('statementInfo,', 'processableStatementInfo,')
    print(f"Line 1033 after: '{lines[1032]}'")
else:
    print("No change needed for line 1033")

# Write back
with open('/Users/christopherealy/Desktop/code/chat-web-app/frontend/src/lib/agents/creditCardAgent.ts', 'w') as f:
    f.write('\n'.join(lines))

print("Done!")
