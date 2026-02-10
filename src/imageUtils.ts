/**
 * Resize an image file to 256x256px
 * Returns a new File object with the resized image
 */
export async function resizeImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      const img = new Image()
      
      img.onload = () => {
        // Create canvas
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        
        if (!ctx) {
          reject(new Error('Failed to get canvas context'))
          return
        }
        
        // Set canvas to 256x256
        canvas.width = 256
        canvas.height = 256
        
        // Calculate crop dimensions to maintain aspect ratio
        const size = Math.min(img.width, img.height)
        const x = (img.width - size) / 2
        const y = (img.height - size) / 2
        
        // Draw image centered and cropped
        ctx.drawImage(
          img,
          x, y, size, size,  // Source crop
          0, 0, 256, 256     // Destination
        )
        
        // Convert to blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob'))
              return
            }
            
            // Create new file from blob
            const resizedFile = new File(
              [blob],
              file.name,
              { type: file.type }
            )
            
            resolve(resizedFile)
          },
          file.type,
          0.9 // Quality (0.9 = 90%)
        )
      }
      
      img.onerror = () => {
        reject(new Error('Failed to load image'))
      }
      
      img.src = e.target?.result as string
    }
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }
    
    reader.readAsDataURL(file)
  })
}
