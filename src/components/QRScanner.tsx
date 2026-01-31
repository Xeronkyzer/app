import { QrReader } from 'react-qr-reader';

interface QRScannerProps {
    onScan: (data: string) => void;
}

const QRScanner = ({ onScan }: QRScannerProps) => {
    const handleResult = (result: any) => {
        if (result) {
            onScan(result?.text);
        }
    };

    return (
        <div className="scanner-wrapper">
            <QrReader
                onResult={handleResult}
                constraints={{ facingMode: 'environment' }}
                containerStyle={{ width: '100%', height: '100%' }}
                videoStyle={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
        </div>
    );
};

export default QRScanner;
