/**
 * FormForge — Sample Document Generator
 *
 * Generates downloadable sample PDF (jsPDF) and DOCX (docx) files shown in
 * the Help modal. Guards give a friendly error if a CDN library failed.
 */

const SampleGenerator = {
  generateSamplePDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('PDF library failed to load. Check your internet connection and refresh the page.');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const margin = 25;
    let y = margin + 22;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('UNCLASSIFIED', margin, margin - 5);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('DEPARTMENT OF DEFENSE', pageWidth / 2, margin + 5, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('FormForge · Official Correspondence', pageWidth / 2, margin + 12, { align: 'center' });
    y = margin + 22;
    doc.line(margin, y - 2, pageWidth - margin, y - 2);

    const content = [
      ['OFFR DATA', 20, 'bold'],
      ['MAIN DETAILS', 16, 'bold'],
      ['1. BA NO: ___________________', 14, 'normal'],
      ['2. RK: ______________________', 14, 'normal'],
      ['3. NAME: ____________________', 14, 'normal'],
      ['OTHER DETAILS', 16, 'bold'],
      ['4. COURSE: __________________', 14, 'normal'],
      ['5. PREV UNIT: _______________', 14, 'normal'],
      ['ADDL DETAILS', 16, 'bold'],
      ['6. PHONE NUMBER: ____________', 14, 'normal'],
      ['7. EMAIL ADDRESS: ___________', 14, 'normal'],
      ['Signature: ____________________', 14, 'normal'],
      ['Date: _________________________', 14, 'normal'],
    ];

    content.forEach(([text, size, style]) => {
      if (y > pageHeight - margin - 20) {
        doc.addPage();
        y = margin + 22;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('UNCLASSIFIED', margin, margin - 5);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('DEPARTMENT OF DEFENSE', pageWidth / 2, margin + 5, { align: 'center' });
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('FormForge · Official Correspondence', pageWidth / 2, margin + 12, { align: 'center' });
        y = margin + 22;
        doc.line(margin, y - 2, pageWidth - margin, y - 2);
      }
      doc.setFontSize(size);
      doc.setFont('helvetica', style);
      doc.text(text, margin, y);
      y += (size / 2) + 4;
    });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text('Page 1 of 1', pageWidth - margin, pageHeight - margin + 2, { align: 'right' });

    doc.save('sample_form.pdf');
  },

  generateSampleDOCX() {
    const { Document, Packer, Paragraph, TextRun } = window.docx || window.Docx;
    if (!Document || !Packer) {
      alert('DOCX library not loaded. Please refresh and try again.');
      return;
    }
    const children = [
      new Paragraph({ children: [new TextRun({ text: 'UNCLASSIFIED', size: 16 })], spacing: { after: 60 } }),
      new Paragraph({ children: [new TextRun({ text: 'DEPARTMENT OF DEFENSE', size: 28, bold: true })], alignment: 'center', spacing: { after: 60 } }),
      new Paragraph({ children: [new TextRun({ text: 'FormForge · Official Correspondence', size: 18 })], alignment: 'center', spacing: { after: 120 } }),
      new Paragraph({ children: [new TextRun({ text: '__________________________________________________', size: 12 })], spacing: { after: 120 } }),
      new Paragraph({ children: [new TextRun({ text: 'OFFR DATA', size: 28, bold: true })], spacing: { after: 200 } }),
      new Paragraph({ children: [new TextRun({ text: 'MAIN DETAILS', size: 22, bold: true })], spacing: { after: 150 } }),
      new Paragraph({ children: [new TextRun({ text: '1. BA NO: ___________________', size: 20 })], spacing: { after: 120 } }),
      new Paragraph({ children: [new TextRun({ text: '2. RK: ______________________', size: 20 })], spacing: { after: 120 } }),
      new Paragraph({ children: [new TextRun({ text: '3. NAME: ____________________', size: 20 })], spacing: { after: 200 } }),
      new Paragraph({ children: [new TextRun({ text: 'OTHER DETAILS', size: 22, bold: true })], spacing: { after: 150 } }),
      new Paragraph({ children: [new TextRun({ text: '4. COURSE: __________________', size: 20 })], spacing: { after: 120 } }),
      new Paragraph({ children: [new TextRun({ text: '5. PREV UNIT: _______________', size: 20 })], spacing: { after: 200 } }),
      new Paragraph({ children: [new TextRun({ text: 'ADDL DETAILS', size: 22, bold: true })], spacing: { after: 150 } }),
      new Paragraph({ children: [new TextRun({ text: '6. PHONE NUMBER: ____________', size: 20 })], spacing: { after: 120 } }),
      new Paragraph({ children: [new TextRun({ text: '7. EMAIL ADDRESS: ___________', size: 20 })], spacing: { after: 200 } }),
      new Paragraph({ children: [new TextRun({ text: 'Signature: ____________________', size: 20 })], spacing: { after: 120 } }),
      new Paragraph({ children: [new TextRun({ text: 'Date: _________________________', size: 20 })], spacing: { after: 200 } }),
      new Paragraph({ children: [new TextRun({ text: 'Page 1 of 1', size: 16, italics: true })], alignment: 'right', spacing: { after: 50 } }),
    ];
    const doc = new Document({ sections: [{ properties: {}, children }] });
    Packer.toBlob(doc).then(blob => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'sample_form.docx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(link.href), 100);
    }).catch(err => alert('Error generating sample DOCX: ' + err.message));
  }
};

export default SampleGenerator;