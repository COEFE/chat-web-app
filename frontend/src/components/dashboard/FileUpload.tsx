'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';
import { getStorage, ref, uploadBytesResumable as firebaseUploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useAuth } from '@/context/AuthContext';
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { UploadCloud, File as FileIcon, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MyDocumentData } from '@/types';

interface UploadingFile {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string | null;
  id: string;
}

interface FileUploadProps {
  className?: string;
  onUploadComplete?: () => void;
  currentFolderId?: string | null;
}

const acceptedFileTypes = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'text/csv': ['.csv'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
};

export function FileUpload({ 
  className,
  onUploadComplete,
  currentFolderId
}: FileUploadProps) {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [rejectedFiles, setRejectedFiles] = useState<File[]>([]);
  const { user } = useAuth();

  const handleUpload = useCallback(async (filesToProcess: UploadingFile[]) => {
    console.log('======== FILE UPLOAD ATTEMPT (Sequential with Direct State) ========');
    console.log('Auth state:', user ? 'Authenticated' : 'Not authenticated');
    console.log('User info:', user);
    console.log('Storage bucket:', getStorage().app.options.storageBucket || 'DEFAULT');
    console.log('Files to process:', filesToProcess.map(f => ({ name: f.file.name, id: f.id, status: f.status })));

    console.log(`handleUpload - currentFolderId prop value: ${currentFolderId}`); // Log prop value

    if (!user) {
      console.error('Upload Error: User not authenticated.');
      setUploadingFiles((prev) =>
        prev.map((uf) =>
          filesToProcess.some(ftp => ftp.id === uf.id) 
            ? { ...uf, status: 'error', error: 'Not authenticated' } 
            : uf
        )
      );
      return;
    }

    console.log(`handleUpload (Direct State) called with ${filesToProcess.length} files.`);
    let allSucceeded = true;

    for (const fileState of filesToProcess) {
      const file = fileState.file; 
      console.log(`Processing file sequentially: ${file.name} (ID: ${fileState.id})`);
      
      if (fileState.status !== 'pending') {
          console.log(`Skipping file ${file.name} (ID: ${fileState.id}), status is not pending (${fileState.status}).`);
          continue; 
      }

      const storagePath = `users/${user.uid}/${file.name}`;
      console.log(`Using standard storage path: ${storagePath}`);
      const storageRef = ref(getStorage(), storagePath);
      
      // Add metadata to the upload that the Cloud Function can use
      const metadata: { customMetadata: Record<string, string> } = {
        customMetadata: {
          userId: user.uid,
          originalName: file.name,
          timestamp: Date.now().toString(), // Add timestamp to ensure uniqueness
          ...(currentFolderId && { folderId: currentFolderId }) // Include folderId if present
        }
      };
      
      console.log(`Setting metadata for upload: userId=${metadata.customMetadata.userId}, originalName=${metadata.customMetadata.originalName}, folderId=${metadata.customMetadata.folderId}`);

      try {
        setUploadingFiles((prev) =>
          prev.map((uf) =>
            uf.id === fileState.id ? { ...uf, status: 'uploading', progress: 30 } : uf
          )
        );
        
        console.log(`Starting direct upload for ${file.name}`);
        const snapshot = await firebaseUploadBytesResumable(storageRef, file, metadata);
        console.log(`Upload SUCCESS for ${file.name}`, snapshot);

        setUploadingFiles((prev) =>
          prev.map((uf) =>
            uf.id === fileState.id ? { ...uf, progress: 70 } : uf
          )
        );
        
        console.log(`Getting download URL for ${file.name}...`);
        const downloadURL = await getDownloadURL(snapshot.ref);
        console.log(`Got download URL for ${file.name}: ${downloadURL}`);

        console.log('File uploaded successfully with download URL:', downloadURL);
        console.log('The Cloud Function will handle creating the Firestore document.');

        setUploadingFiles((prev) =>
          prev.map((uf) =>
            uf.id === fileState.id ? { ...uf, status: 'success', progress: 100 } : uf
          )
        );

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error processing file ${file.name} (ID: ${fileState.id}):`, errorMessage, error);
        allSucceeded = false;
        setUploadingFiles((prev) =>
          prev.map((uf) =>
            uf.id === fileState.id ? { ...uf, status: 'error', error: errorMessage || 'Upload failed' } : uf
          )
        );
      }
    } 

    console.log(`Finished processing all ${filesToProcess.length} files sequentially. All succeeded: ${allSucceeded}`);

    if (allSucceeded && onUploadComplete) {
      console.log('Introducing delay before refreshing documents...');
      // Add timeout to allow the Cloud Function to complete processing
      setTimeout(() => {
        console.log('Calling onUploadComplete callback after delay.');
        onUploadComplete();
      }, 7000);  // 7-second delay (Increased for testing)
    }

  }, [user, onUploadComplete, currentFolderId]); 

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      console.log('Accepted files:', acceptedFiles);
      console.log('Rejected files:', fileRejections);
 
      const newUploadingFilesState: UploadingFile[] = acceptedFiles.map(file => ({
        file,
        status: 'pending',
        progress: 0,
        error: null,
        id: `${file.name}-${file.lastModified}-${file.size}` 
      }));

      setUploadingFiles((prev) => [...prev, ...newUploadingFilesState]);
      setRejectedFiles((prev) => [
        ...prev,
        ...fileRejections.map((rejection) => rejection.file),
      ]);

      if (newUploadingFilesState.length > 0) {
           console.log('Calling handleUpload directly with new file states...');
           handleUpload(newUploadingFilesState); 
      }
    },
    [handleUpload] 
  );

  const { getRootProps, getInputProps, isDragActive, isDragAccept, isDragReject, open } =
    useDropzone({
      onDrop,
      accept: acceptedFileTypes,
      maxSize: 10 * 1024 * 1024, // 10MB
      disabled: !user,
    });

  const removeFile = (fileIdToRemove: string) => {
    setUploadingFiles((prev) => prev.filter((uf) => uf.id !== fileIdToRemove));
  };

  const clearRejected = () => {
    setRejectedFiles([]);
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div
        {...getRootProps()}
        className={cn(
          'group relative flex h-52 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/50 bg-background transition-colors duration-200 ease-in-out',
          { 'border-primary/60 bg-primary/5': isDragAccept },
          { 'border-red-500/60 bg-red-500/5': isDragReject },
          { 'border-primary/60': isDragActive && !isDragAccept && !isDragReject },
          { 'cursor-not-allowed opacity-50': !user },
          className
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center gap-2 text-center text-muted-foreground">
          <UploadCloud className="h-10 w-10 text-gray-400 group-hover:text-primary/80" />
          {isDragAccept && <p>Drop the files here ...</p>}
          {isDragReject && <p>Some files will be rejected</p>}
          {!isDragActive && (
            <p>
              Drag &apos;n&apos; drop some files here, or click select files
            </p>
          )}
          <p className="text-xs">(Max 10MB per file)</p>
          <Button 
            type="button" 
            variant="outline" 
            size="sm" 
            className="mt-2" 
            onClick={(e) => { 
              e.stopPropagation(); // Prevent dropzone activation on button click
              open(); 
            }}
            disabled={!user}
          >
            Select Files
          </Button>
        </div>
      </div>

      {uploadingFiles.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-lg font-medium">Uploads:</h4>
          <ul className="space-y-3">
            {uploadingFiles.map((uploadingFile) => (
              <li key={uploadingFile.id} className="flex items-center justify-between space-x-2 p-2 border rounded-md">
                <div className="flex items-center space-x-2 flex-1 min-w-0">
                  <FileIcon className="h-5 w-5 mr-2 flex-shrink-0 text-gray-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{uploadingFile.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      ({Math.round(uploadingFile.file.size / 1024)} KB)
                      {uploadingFile.status === 'error' && <span className='text-red-500 ml-2'>- {uploadingFile.error}</span>}
                    </p>
                    {(uploadingFile.status === 'uploading' || uploadingFile.status === 'success') && (
                      <Progress value={uploadingFile.progress} className="h-2 mt-1" />
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-1 flex-shrink-0">
                  {uploadingFile.status === 'pending' && <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />}
                  {uploadingFile.status === 'uploading' && <Loader2 className="h-5 w-5 text-primary animate-spin" />}
                  {uploadingFile.status === 'success' && <CheckCircle className="h-5 w-5 text-green-500" />}
                  {uploadingFile.status === 'error' && <AlertCircle className="h-5 w-5 text-red-500" />}
                  {(uploadingFile.status === 'pending' || uploadingFile.status === 'error') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(uploadingFile.id)}
                      className="text-red-500 hover:text-red-700 p-1 h-auto"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rejectedFiles.length > 0 && (
        <div className="space-y-2 mt-4 p-3 border border-red-200 bg-red-50 rounded-md">
          <div className="flex justify-between items-center">
            <h4 className="text-base font-medium text-red-700">Rejected Files:</h4>
            <Button variant="ghost" size="sm" onClick={clearRejected} className="text-red-600 hover:text-red-800 p-1 h-auto">
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
          </div>
          <ul className="list-disc list-inside space-y-1 text-sm text-red-600">
            {rejectedFiles.map((file, index) => (
              <li key={`${file.name}-${index}`}>
                {file.name} - Invalid type or size too large
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
