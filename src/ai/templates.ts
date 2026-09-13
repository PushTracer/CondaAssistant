export interface CUDAVariant {
  label: string;
  cudaVersion: string;
  pipIndex?: string;
  extraPip?: string[];
}

export interface AIEnvTemplate {
  name: string;
  label: string;
  description: string;
  pythonVersion: string;
  pipPackages: string[];
  cudaVariants: CUDAVariant[];
}

export const AI_ENV_TEMPLATES: AIEnvTemplate[] = [
  {
    name: 'pytorch',
    label: 'PyTorch',
    description: '深度学习框架，支持 CUDA 加速',
    pythonVersion: '3.12',
    pipPackages: [],
    cudaVariants: [
      { label: 'CPU', cudaVersion: 'cpu', extraPip: ['torch', 'torchvision', 'torchaudio'] },
      { label: 'CUDA 12.1', cudaVersion: 'cu121', extraPip: ['torch', 'torchvision', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu121'] },
      { label: 'CUDA 12.4', cudaVersion: 'cu124', extraPip: ['torch', 'torchvision', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu124'] },
      { label: 'CUDA 12.6', cudaVersion: 'cu126', extraPip: ['torch', 'torchvision', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu126'] },
      { label: 'Nightly', cudaVersion: 'nightly', extraPip: ['torch', 'torchvision', 'torchaudio', '--pre', '--index-url', 'https://download.pytorch.org/whl/nightly/cu126'] },
    ]
  },
  {
    name: 'tensorflow',
    label: 'TensorFlow',
    description: '深度学习框架，支持 GPU 加速',
    pythonVersion: '3.11',
    pipPackages: [],
    cudaVariants: [
      { label: 'CPU', cudaVersion: 'cpu', extraPip: ['tensorflow', 'tensorflow-datasets', 'tensorboard'] },
      { label: 'GPU', cudaVersion: 'gpu', extraPip: ['tensorflow', 'tensorflow-datasets', 'tensorboard'] },
    ]
  },
  {
    name: 'datascience',
    label: '数据科学基础',
    description: 'NumPy, Pandas, Matplotlib, Scikit-learn, Jupyter',
    pythonVersion: '3.12',
    pipPackages: ['numpy', 'pandas', 'matplotlib', 'scikit-learn', 'jupyter', 'scipy'],
    cudaVariants: [
      { label: '标准', cudaVersion: '', extraPip: [] },
    ]
  },
  {
    name: 'computervision',
    label: '计算机视觉',
    description: 'OpenCV, Pillow, PyTorch, torchvision',
    pythonVersion: '3.12',
    pipPackages: ['opencv-python', 'pillow'],
    cudaVariants: [
      { label: 'CPU', cudaVersion: 'cpu', extraPip: ['torch', 'torchvision'] },
      { label: 'CUDA 12.4', cudaVersion: 'cu124', extraPip: ['torch', 'torchvision', '--index-url', 'https://download.pytorch.org/whl/cu124'] },
    ]
  },
  {
    name: 'nlp',
    label: '自然语言处理',
    description: 'Transformers, Datasets, Tokenizers, Sentence-Transformers',
    pythonVersion: '3.12',
    pipPackages: ['transformers', 'datasets', 'tokenizers', 'sentence-transformers', 'accelerate', 'evaluate'],
    cudaVariants: [
      { label: 'CPU', cudaVersion: 'cpu' },
      { label: 'CUDA 12.4', cudaVersion: 'cu124', extraPip: ['torch', 'torchvision', '--index-url', 'https://download.pytorch.org/whl/cu124'] },
    ]
  },
  {
    name: 'xgb-lightgbm',
    label: 'XGBoost / LightGBM',
    description: '梯度提升框架，含 GPU 支持',
    pythonVersion: '3.12',
    pipPackages: ['xgboost', 'lightgbm'],
    cudaVariants: [
      { label: '标准', cudaVersion: '', extraPip: [] },
    ]
  }
];
