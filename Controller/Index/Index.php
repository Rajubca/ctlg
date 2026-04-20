<?php
namespace Shatchi\Catalogue3\Controller\Index;

use Magento\Framework\App\Action\Action;
use Magento\Framework\App\Action\Context;
use Magento\Framework\View\Result\PageFactory;
use Magento\Framework\App\Config\ScopeConfigInterface;

class Index extends Action
{
    protected $resultPageFactory;
    protected $scopeConfig;

    public function __construct(
        Context $context,
        PageFactory $resultPageFactory,
        ScopeConfigInterface $scopeConfig
    ) {
        $this->resultPageFactory = $resultPageFactory;
        $this->scopeConfig = $scopeConfig;
        parent::__construct($context);
    }

    public function execute()
    {
        $resultPage = $this->resultPageFactory->create();
        $title = $this->scopeConfig->getValue('shatchi_catalogue3/general/meta_title', \Magento\Store\Model\ScopeInterface::SCOPE_STORE) ?: 'Shatchi | Premium Seasonal Catalog 3';
        $resultPage->getConfig()->getTitle()->set(__($title));
        return $resultPage;
    }
}
