/**
 * Template Engine for PowerShell Modules
 * Extracts variables from script like _{variable}_ and replaces them with user input
 * 
 * Supported formats:
 * - _{name}_ - Simple variable
 * - _{name,placeholder}_ - Variable with placeholder
 * - _{name,list,(option1,option2,...)}_ - Dropdown list
 * - _{name,radio,(option1,option2,...)}_ - Radio buttons
 * - _{name,check,(true,false),placeholder1,placeholder2}_ - Checkbox
 */

/**
 * Extract variables from script
 * @param {string} script - PowerShell script
 * @returns {Array<{name: string, placeholder: string, type: string, options: Array}>} - Array of variable objects
 */
export function extractVariables(script) {
  if (!script) return []
  
  // Match pattern _{...}_
  const pattern = /_{([^}]+)}_/g
  const variables = []
  const seen = new Set()
  
  let match
  while ((match = pattern.exec(script)) !== null) {
    const fullMatch = match[1] // e.g., "ip,192.168.1.1" or "ip,list,(a,b,c)"
    
    try {
      const parsed = parseVariable(fullMatch)
      
      // Only add if not seen before
      if (parsed.name && !seen.has(parsed.name)) {
        seen.add(parsed.name)
        variables.push(parsed)
      }
    } catch (e) {
      console.error('Error parsing variable:', fullMatch, e)
      // Fallback to simple variable
      if (!seen.has(fullMatch.trim())) {
        seen.add(fullMatch.trim())
        variables.push({
          name: fullMatch.trim(),
          placeholder: fullMatch.trim(),
          type: 'text',
          options: []
        })
      }
    }
  }
  
  return variables
}

/**
 * Parse a variable definition
 * @param {string} varDef - Variable definition string
 * @returns {Object} - Parsed variable object
 */
function parseVariable(varDef) {
  varDef = varDef.trim()
  
  // Simple: _{name}_
  if (!varDef.includes(',')) {
    return {
      name: varDef,
      placeholder: varDef,
      type: 'text',
      options: []
    }
  }
  
  // Find first comma to separate name from rest
  const firstCommaIndex = varDef.indexOf(',')
  const name = varDef.substring(0, firstCommaIndex).trim()
  const rest = varDef.substring(firstCommaIndex + 1).trim()
  
  // Format: _{name,placeholder}_ (no parentheses)
  if (!rest.includes('(')) {
    return {
      name: name,
      placeholder: rest,
      type: 'text',
      options: []
    }
  }
  
  // Check if it's a type with options: _{name,type,(options)}_
  const secondCommaIndex = rest.indexOf(',')
  if (secondCommaIndex === -1) {
    // Fallback
    return {
      name: name,
      placeholder: rest,
      type: 'text',
      options: []
    }
  }
  
  const type = rest.substring(0, secondCommaIndex).trim().toLowerCase()
  const afterType = rest.substring(secondCommaIndex + 1).trim()
  
  // Check if type is list, radio, or check
  if (type === 'list' || type === 'radio' || type === 'check') {
    // Find the options in parentheses
    const optionsMatch = afterType.match(/^\(([^)]+)\)/)
    
    if (optionsMatch) {
      const optionsStr = optionsMatch[1]
      const options = optionsStr.split(',').map(o => o.trim()).filter(o => o)
      
      if (type === 'check') {
        // Checkbox format: _{name,check,(true,false),placeholder1,placeholder2}_
        const afterOptions = afterType.substring(optionsMatch[0].length).trim()
        const placeholders = afterOptions ? afterOptions.split(',').map(p => p.trim()).filter(p => p) : []
        
        return {
          name,
          placeholder: placeholders[0] || 'Yes',
          placeholder2: placeholders[1] || 'No',
          type: 'checkbox',
          options: options
        }
      } else {
        // List or Radio
        return {
          name,
          placeholder: 'Select...',
          type: type,
          options: options
        }
      }
    }
  }
  
  // Fallback: treat as _{name,placeholder}_
  return {
    name: name,
    placeholder: rest,
    type: 'text',
    options: []
  }
}

/**
 * Replace variables in script with values
 * @param {string} script - PowerShell script
 * @param {Object} values - Object with variable names as keys and values as values
 * @returns {string} - Script with replaced variables
 */
export function replaceVariables(script, values) {
  if (!script) return script
  
  let result = script
  
  // Replace _{...}_ with value
  const pattern = /_{([^}]+)}_/g
  
  result = result.replace(pattern, (match, fullMatch) => {
    try {
      const parsed = parseVariable(fullMatch)
      const value = values[parsed.name]
      
      if (value !== undefined && value !== null && value !== '') {
        return value
      }
      
      // If value not provided, keep original
      return match
    } catch (e) {
      // Fallback: extract name from first part
      const name = fullMatch.split(',')[0].trim()
      const value = values[name]
      return value !== undefined && value !== null && value !== '' ? value : match
    }
  })
  
  return result
}

