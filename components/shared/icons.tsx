import Image from 'next/image'

import { Infinity, AlertCircle, Copy, FileIcon, Loader2 } from 'lucide-react'

interface FlareIconProps extends Omit<React.ComponentProps<typeof Image>, 'src' | 'alt' | 'width' | 'height'> {
  width?: number
  height?: number
}

const FlareIcon = ({ width = 24, height = 24, ...props }: FlareIconProps) => (
  <Image src="/icon.svg" width={width} height={height} alt="CXR-Lab Logo" {...props} />
)

export const Icons = {
  logo: FlareIcon,
  spinner: Loader2,
  file: FileIcon,
  alertCircle: AlertCircle,
  copy: Copy,
  infinity: Infinity,
} as const
